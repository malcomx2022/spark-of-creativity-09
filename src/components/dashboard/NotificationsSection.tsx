import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Mail, MessageSquare, Smartphone, Phone, BellRing } from 'lucide-react';
import { useNotifications, useNotificationPreferences, useMarkNotificationAsRead } from '@/hooks/useNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export function NotificationsSection() {
  const { data: user } = useSupabaseUser();
  const { data: notifications = [] } = useNotifications(user?.id);
  const { data: preferences } = useNotificationPreferences(user?.id);
  const markAsRead = useMarkNotificationAsRead();
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications(user?.id);
  
  const [localPrefs, setLocalPrefs] = useState({
    email: preferences?.email_enabled ?? true,
    sms: preferences?.sms_enabled ?? false,
    whatsapp: preferences?.whatsapp_enabled ?? false,
    push: preferences?.push_enabled ?? true,
  });

  const [isUpdating, setIsUpdating] = useState({
    email: false,
    sms: false,
    whatsapp: false,
    push: false,
  });

  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Synchroniser localPrefs avec les préférences chargées
  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        email: preferences.email_enabled,
        sms: preferences.sms_enabled,
        whatsapp: preferences.whatsapp_enabled,
        push: preferences.push_enabled,
      });
    }
  }, [preferences]);

  const handlePreferenceChange = useCallback(async (key: keyof typeof localPrefs, value: boolean) => {
    if (!user?.id) return;
    
    // Optimistic update
    setLocalPrefs(prev => ({ ...prev, [key]: value }));

    // Annuler le timer précédent pour cette préférence
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }

    // Debounce de 300ms
    debounceTimers.current[key] = setTimeout(async () => {
      setIsUpdating(prev => ({ ...prev, [key]: true }));

      try {
        const columnMap = {
          email: 'email_enabled',
          sms: 'sms_enabled',
          whatsapp: 'whatsapp_enabled',
          push: 'push_enabled',
        };
        
        const updateData: any = { 
          user_id: user.id,
          [columnMap[key]]: value 
        };

        const { error } = await supabase
          .from('notification_preferences')
          .upsert(updateData, { 
            onConflict: 'user_id',
            ignoreDuplicates: false 
          });

        if (error) throw error;
        
        toast({ 
          title: 'Préférences mises à jour',
          description: 'Vos préférences de notification ont été enregistrées.'
        });
      } catch (error: any) {
        console.error('Error updating preferences:', error);
        toast({ 
          title: 'Erreur lors de la mise à jour',
          description: error.message || 'Impossible de mettre à jour vos préférences.',
          variant: 'destructive' 
        });
        // Revert optimistic update
        setLocalPrefs(prev => ({ ...prev, [key]: !value }));
      } finally {
        setIsUpdating(prev => ({ ...prev, [key]: false }));
      }
    }, 300);
  }, [user?.id]);

  // Nettoyer les timers au démontage
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  const handleNotificationClick = (notificationId: string, isRead: boolean) => {
    if (!isRead && user?.id) {
      markAsRead.mutate({ notificationId, userId: user.id });
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
              {notifications.map((notification) => {
                const notificationWithAnimation = notification as typeof notification & { isNew?: boolean };
                return (
                  <div
                    key={notification.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all duration-300 ${
                      !notification.is_read ? 'bg-primary/5 border-primary/20' : ''
                    } ${
                      notificationWithAnimation.isNew ? 'animate-scale-in shadow-lg ring-2 ring-primary/50' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification.id, notification.is_read)}
                  >
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium">{notification.title}</p>
                    {!notification.is_read && (
                      <Badge 
                        variant="default" 
                        className={`ml-2 ${notificationWithAnimation.isNew ? 'animate-pulse' : ''}`}
                      >
                        Nouveau
                      </Badge>
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
                );
              })}
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
            <div className="relative">
              <Switch 
                checked={localPrefs.email} 
                onCheckedChange={(v) => handlePreferenceChange('email', v)}
                disabled={isUpdating.email}
              />
              {isUpdating.email && (
                <Loader2 className="h-4 w-4 animate-spin absolute -right-6 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>SMS</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir les notifications par SMS
                </p>
              </div>
            </div>
            <div className="relative">
              <Switch 
                checked={localPrefs.sms} 
                onCheckedChange={(v) => handlePreferenceChange('sms', v)}
                disabled={isUpdating.sms}
              />
              {isUpdating.sms && (
                <Loader2 className="h-4 w-4 animate-spin absolute -right-6 top-1/2 -translate-y-1/2" />
              )}
            </div>
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
            <div className="relative">
              <Switch 
                checked={localPrefs.whatsapp} 
                onCheckedChange={(v) => handlePreferenceChange('whatsapp', v)}
                disabled={isUpdating.whatsapp}
              />
              {isUpdating.whatsapp && (
                <Loader2 className="h-4 w-4 animate-spin absolute -right-6 top-1/2 -translate-y-1/2" />
              )}
            </div>
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
            <div className="relative">
              <Switch 
                checked={localPrefs.push} 
                onCheckedChange={(v) => handlePreferenceChange('push', v)}
                disabled={isUpdating.push}
              />
              {isUpdating.push && (
                <Loader2 className="h-4 w-4 animate-spin absolute -right-6 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          {/* Push Notifications Browser */}
          {isSupported && (
            <div className="mt-6 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-start gap-3 mb-4">
                <BellRing className="h-5 w-5 text-primary mt-1" />
                <div className="flex-1">
                  <Label className="text-base">Notifications Push Navigateur</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Recevez des notifications même quand l'application est fermée. 
                    Vous devez autoriser les notifications dans votre navigateur.
                  </p>
                </div>
              </div>
              <Button
                onClick={isSubscribed ? unsubscribe : subscribe}
                disabled={isLoading}
                variant={isSubscribed ? 'outline' : 'default'}
                className="w-full"
              >
                {isLoading 
                  ? 'Chargement...' 
                  : isSubscribed 
                    ? 'Désactiver les notifications push' 
                    : 'Activer les notifications push'
                }
              </Button>
              {isSubscribed && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  ✓ Les notifications push sont activées
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
