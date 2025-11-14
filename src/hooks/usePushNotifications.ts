import { useState, useEffect } from 'react';
import { 
  isPushSupported, 
  getPermissionStatus, 
  subscribeToPush, 
  unsubscribeFromPush,
  isPushSubscribed 
} from '@/lib/push-notifications';
import { toast } from '@/hooks/use-toast';

export function usePushNotifications(userId?: string) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if push is supported
    setIsSupported(isPushSupported());
    
    // Get initial permission status
    setPermission(getPermissionStatus());

    // Check if already subscribed
    if (userId) {
      isPushSubscribed().then(setIsSubscribed);
    }
  }, [userId]);

  const subscribe = async () => {
    if (!userId) {
      toast({
        title: 'Erreur',
        description: 'Vous devez être connecté pour activer les notifications push.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await subscribeToPush(userId);
      
      if (success) {
        setIsSubscribed(true);
        setPermission('granted');
        toast({
          title: 'Notifications push activées',
          description: 'Vous recevrez désormais des notifications push.',
        });
      } else {
        toast({
          title: 'Permission refusée',
          description: 'Vous devez autoriser les notifications dans votre navigateur.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error subscribing to push:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible d\'activer les notifications push.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      await unsubscribeFromPush(userId);
      setIsSubscribed(false);
      toast({
        title: 'Notifications push désactivées',
        description: 'Vous ne recevrez plus de notifications push.',
      });
    } catch (error: any) {
      console.error('Error unsubscribing from push:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de désactiver les notifications push.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
