import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { useNotifications, useNotificationPreferences, useMarkNotificationAsRead } from '@/hooks/useNotifications';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

export function NotificationsSection() {
  const { data: user } = useSupabaseUser();
  const { data: notifications = [] } = useNotifications(user?.id);
  const { data: preferences } = useNotificationPreferences(user?.id);
  const markAsRead = useMarkNotificationAsRead();

  const handleNotificationClick = (notificationId: string, isRead: boolean) => {
    if (!isRead) {
      markAsRead.mutate(notificationId);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications récentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-muted-foreground">Aucune notification</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    !notification.is_read ? 'bg-primary/5 border-primary/20' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification.id, notification.is_read)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium">{notification.title}</p>
                    {!notification.is_read && (
                      <Badge variant="default" className="ml-2">Nouveau</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(notification.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Préférences de notification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Email</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir les notifications par email
                </p>
              </div>
            </div>
            <Switch checked={preferences?.email_enabled ?? true} />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>SMS</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir les notifications par SMS
                </p>
              </div>
            </div>
            <Switch checked={preferences?.sms_enabled ?? false} />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>WhatsApp</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir les notifications sur WhatsApp
                </p>
              </div>
            </div>
            <Switch checked={preferences?.whatsapp_enabled ?? false} />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Push</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir les notifications push
                </p>
              </div>
            </div>
            <Switch checked={preferences?.push_enabled ?? true} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
