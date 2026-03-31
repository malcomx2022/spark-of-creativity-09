import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Bell, Mail, MessageSquare, Smartphone, Phone, BellRing,
  RefreshCw, Loader2, CheckCheck, Trash2, Calendar, AlertCircle,
  Info, CheckCircle, XCircle, Filter
} from 'lucide-react';
import {
  useNotifications,
  useNotificationPreferences,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useDeleteNotification
} from '@/hooks/useNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

// Icônes par type de notification
const NOTIFICATION_ICONS: Record<string, React.ElementType> = {
  appointment: Calendar,
  message: MessageSquare,
  alert: AlertCircle,
  info: Info,
  success: CheckCircle,
  error: XCircle,
  default: Bell,
};

// Couleurs par type de notification
const NOTIFICATION_COLORS: Record<string, string> = {
  appointment: 'text-blue-500',
  message: 'text-green-500',
  alert: 'text-orange-500',
  info: 'text-sky-500',
  success: 'text-emerald-500',
  error: 'text-red-500',
  default: 'text-primary',
};

export function NotificationsSection() {
  const { data: user } = useSupabaseUser();
  const { data: notifications = [], isLoading, isFetching, refetch } = useNotifications(user?.id);
  const { data: preferences } = useNotificationPreferences(user?.id);
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const deleteNotification = useDeleteNotification();
  const { isSupported, isSubscribed, isLoading: isPushLoading, subscribe, unsubscribe } = usePushNotifications(user?.id);

  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read'>('all');
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);

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

  const debounceTimers = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});

  // Filtrer les notifications
  const filteredNotifications = useMemo(() => {
    if (filterStatus === 'all') return notifications;
    if (filterStatus === 'unread') return notifications.filter(n => !n.is_read);
    return notifications.filter(n => n.is_read);
  }, [notifications, filterStatus]);

  // Statistiques
  const stats = useMemo(() => {
    const unread = notifications.filter(n => !n.is_read).length;
    return {
      total: notifications.length,
      unread,
      read: notifications.length - unread,
    };
  }, [notifications]);

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

  const handleMarkAllAsRead = () => {
    if (user?.id && stats.unread > 0) {
      markAllAsRead.mutate(user.id);
    }
  };

  const handleDeleteNotification = () => {
    if (notificationToDelete && user?.id) {
      deleteNotification.mutate({ notificationId: notificationToDelete, userId: user.id });
      setNotificationToDelete(null);
    }
  };

  const getNotificationIcon = (type?: string) => {
    const Icon = NOTIFICATION_ICONS[type || 'default'] || NOTIFICATION_ICONS.default;
    const colorClass = NOTIFICATION_COLORS[type || 'default'] || NOTIFICATION_COLORS.default;
    return <Icon className={`h-5 w-5 ${colorClass}`} />;
  };

  const formatNotificationDate = (dateString: string) => {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true, locale: fr });
  };

  const formatFullDate = (dateString: string) => {
    return format(new Date(dateString), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton en-tête */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Skeleton statistiques */}
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-6 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton notifications */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 border rounded-lg">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-full mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Skeleton préférences */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5" />
                    <div>
                      <Skeleton className="h-4 w-20 mb-1" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-10" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notifications
            {stats.unread > 0 && (
              <Badge variant="destructive">{stats.unread}</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Gérez vos notifications et préférences
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Bell className="h-4 w-4" />
              Total
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Mail className="h-4 w-4" />
              Non lues
            </div>
            <p className="text-2xl font-bold text-destructive">{stats.unread}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCheck className="h-4 w-4" />
              Lues
            </div>
            <p className="text-2xl font-bold text-muted-foreground">{stats.read}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications récentes
              <Badge variant="secondary">{filteredNotifications.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="unread">Non lues</SelectItem>
                  <SelectItem value="read">Lues</SelectItem>
                </SelectContent>
              </Select>
              {stats.unread > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsRead.isPending}
                >
                  {markAllAsRead.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCheck className="h-4 w-4 mr-2" />
                  )}
                  Tout marquer comme lu
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              {filterStatus !== 'all' ? (
                <>
                  <p className="text-muted-foreground">
                    Aucune notification {filterStatus === 'unread' ? 'non lue' : 'lue'}
                  </p>
                  <Button
                    variant="link"
                    onClick={() => setFilterStatus('all')}
                    className="mt-2"
                  >
                    Voir toutes les notifications
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">Aucune notification</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Vous recevrez des notifications pour vos rendez-vous et messages
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => {
                const isNew = 'isNew' in notification && notification.isNew === true;
                return (
                  <div
                    key={notification.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all duration-300 group ${
                      !notification.is_read ? 'bg-primary/5 border-primary/20' : ''
                    } ${
                      isNew ? 'animate-scale-in shadow-lg ring-2 ring-primary/50' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification.id, notification.is_read)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon((notification as any).type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-medium">{notification.title}</p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!notification.is_read && (
                              <Badge
                                variant="default"
                                className={`${isNew ? 'animate-pulse' : ''}`}
                              >
                                Nouveau
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotificationToDelete(notification.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.message}
                        </p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs text-muted-foreground cursor-help">
                                {formatNotificationDate(notification.created_at)}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatFullDate(notification.created_at)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
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
            <div className="flex items-center gap-2">
              <Badge variant={localPrefs.email ? 'default' : 'secondary'} className="text-xs">
                {localPrefs.email ? 'Activé' : 'Désactivé'}
              </Badge>
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
            <div className="flex items-center gap-2">
              <Badge variant={localPrefs.sms ? 'default' : 'secondary'} className="text-xs">
                {localPrefs.sms ? 'Activé' : 'Désactivé'}
              </Badge>
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
            <div className="flex items-center gap-2">
              <Badge variant={localPrefs.whatsapp ? 'default' : 'secondary'} className="text-xs">
                {localPrefs.whatsapp ? 'Activé' : 'Désactivé'}
              </Badge>
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
            <div className="flex items-center gap-2">
              <Badge variant={localPrefs.push ? 'default' : 'secondary'} className="text-xs">
                {localPrefs.push ? 'Activé' : 'Désactivé'}
              </Badge>
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
                disabled={isPushLoading}
                variant={isSubscribed ? 'outline' : 'default'}
                className="w-full"
              >
                {isPushLoading
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

      {/* AlertDialog pour supprimer une notification */}
      <AlertDialog open={!!notificationToDelete} onOpenChange={() => setNotificationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette notification ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La notification sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNotification}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteNotification.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
