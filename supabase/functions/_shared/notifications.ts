type NotificationChannel = "email" | "sms" | "push";

interface DispatchNotificationOptions {
  supabase: any;
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  channels?: NotificationChannel[];
}

interface ChannelResult {
  attempted: boolean;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export interface DispatchNotificationResult {
  notificationId: string;
  channels: Record<NotificationChannel, ChannelResult>;
}

const DEFAULT_CHANNELS: NotificationChannel[] = ["email", "sms", "push"];

interface NotificationPreferences {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
}

function normalizePhoneNumber(phone: string): string {
  let normalized = phone.trim();
  normalized = normalized.replace(/[^\d+]/g, "");

  if (!normalized.startsWith("+")) {
    normalized = `+${normalized}`;
  }

  return normalized;
}

function isValidPhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

async function sendEmailNotification(to: string, subject: string, message: string, link?: string | null): Promise<ChannelResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY") || Deno.env.get("MAILERSEND_API_KEY") || Deno.env.get("MAILJET_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") || Deno.env.get("MAIL_FROM_EMAIL") || Deno.env.get("NOTIFICATION_EMAIL_FROM");

  if (!apiKey || !from) {
    console.warn("Email notification skipped: missing provider configuration");
    return { attempted: false, success: false, skipped: true };
  }

  const emailBody = link ? `${message}\n\nSuivre le lien: ${link}` : message;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: emailBody,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send email notification:", errorText);
    return {
      attempted: true,
      success: false,
      error: errorText || response.statusText,
    };
  }

  return { attempted: true, success: true };
}

async function sendSmsNotification(to: string, body: string): Promise<ChannelResult> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  // Support both TWILIO_FROM_NUMBER and TWILIO_PHONE_NUMBER for backwards compatibility
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER") || Deno.env.get("TWILIO_PHONE_NUMBER");

  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
    console.warn("SMS notification skipped: missing Twilio configuration");
    return { attempted: false, success: false, skipped: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({
    To: to,
    Body: body,
  });

  if (messagingServiceSid) {
    params.append("MessagingServiceSid", messagingServiceSid);
  } else if (fromNumber) {
    params.append("From", fromNumber);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send SMS notification:", errorText);
    return { attempted: true, success: false, error: errorText || response.statusText };
  }

  return { attempted: true, success: true };
}

async function sendPushNotification(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  title: string,
  message: string,
  link: string | null,
  notificationId: string,
): Promise<ChannelResult> {
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("Push notification skipped: missing Supabase configuration");
    return { attempted: false, success: false, skipped: true };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      userId,
      title,
      message,
      url: link ?? "/",
      notificationId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send push notification:", errorText);
    return { attempted: true, success: false, error: errorText || response.statusText };
  }

  return { attempted: true, success: true };
}

export async function dispatchNotification(options: DispatchNotificationOptions): Promise<DispatchNotificationResult> {
  const {
    supabase,
    supabaseUrl,
    serviceRoleKey,
    userId,
    title,
    message,
    type = "system",
    link = null,
    channels,
  } = options;

  const { data: notification, error: insertError } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      title,
      message,
      type,
      link,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Failed to store notification:", insertError);
    throw insertError;
  }

  const { data: preferences } = await supabase
    .from("notification_preferences")
    .select("email_enabled, sms_enabled, push_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  // Default: SMS enabled for important notifications like appointments
  const effectivePreferences: NotificationPreferences = preferences ?? {
    email_enabled: true,
    sms_enabled: true,
    push_enabled: true,
  };

  const desiredChannels = new Set<NotificationChannel>(channels?.length ? channels : DEFAULT_CHANNELS);

  if (!effectivePreferences.email_enabled) desiredChannels.delete("email");
  if (!effectivePreferences.sms_enabled) desiredChannels.delete("sms");
  if (!effectivePreferences.push_enabled) desiredChannels.delete("push");

  const channelResults: Record<NotificationChannel, ChannelResult> = {
    email: { attempted: false, success: false, skipped: !desiredChannels.has("email") },
    sms: { attempted: false, success: false, skipped: !desiredChannels.has("sms") },
    push: { attempted: false, success: false, skipped: !desiredChannels.has("push") },
  };

  if (desiredChannels.size === 0) {
    return {
      notificationId: notification.id,
      channels: channelResults,
    };
  }

  const [{ data: profile }, adminUserResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("phone, full_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const email = adminUserResult.data?.user?.email ?? null;
  const phoneRaw = profile?.phone ?? null;
  const phone = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;

  if (desiredChannels.has("email")) {
    if (email) {
      channelResults.email = await sendEmailNotification(email, title, message, link);
    } else {
      channelResults.email = { attempted: false, success: false, skipped: true, error: "missing_email" };
    }
  }

  if (desiredChannels.has("sms")) {
    if (phone && isValidPhoneNumber(phone)) {
      channelResults.sms = await sendSmsNotification(phone, message);
    } else {
      channelResults.sms = { attempted: false, success: false, skipped: true, error: "invalid_phone" };
    }
  }

  if (desiredChannels.has("push")) {
    channelResults.push = await sendPushNotification(
      supabaseUrl,
      serviceRoleKey,
      userId,
      title,
      message,
      link,
      notification.id,
    );
  }

  return {
    notificationId: notification.id,
    channels: channelResults,
  };
}

export async function getUsersWithRoles(
  supabase: any,
  roles: string[],
): Promise<string[]> {
  if (roles.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", roles);

  if (error) {
    console.error("Failed to fetch users with roles:", error);
    return [];
  }

  const uniqueIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.user_id) {
      uniqueIds.add(row.user_id);
    }
  }

  return Array.from(uniqueIds);
}
