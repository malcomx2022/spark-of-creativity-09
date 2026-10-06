/**
 * Temps réel (ex Supabase Realtime `postgres_changes` et canaux presence) via la passerelle
 * Socket.IO de l'API : événement `change` {table, op, id, …} diffusé dans les rooms
 * user:<id> / practitioner:<id> / admin / appointment:<id>.
 */
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, onAuthStateChange } from './session';

export type ChangeOp = 'INSERT' | 'UPDATE' | 'DELETE';
export interface ChangeEvent {
  table: string;
  op: ChangeOp;
  id?: string;
  user_id?: string;
  patient_id?: string;
  practitioner_id?: string;
  appointment_id?: string;
  status?: string;
  [key: string]: unknown;
}
export type ChangeHandler = (event: ChangeEvent) => void;

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) || undefined; // undefined = même origine

let socket: Socket | null = null;
const handlers = new Set<{ tables: string[] | null; handler: ChangeHandler }>();
const appointmentRooms = new Map<string, number>();

function dispatch(event: ChangeEvent) {
  for (const h of handlers) {
    if (h.tables && !h.tables.includes(event.table)) continue;
    try {
      h.handler(event);
    } catch (e) {
      console.error('[realtime] handler error', e);
    }
  }
}

export function getSocket(): Socket | null {
  const token = getAccessToken();
  if (!token) return null;
  if (socket) return socket;
  socket = io(WS_URL, { auth: { token }, withCredentials: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 10_000 });
  socket.on('change', dispatch);
  socket.on('ready', () => {
    for (const id of appointmentRooms.keys()) socket?.emit('subscribe:appointment', { appointmentId: id });
  });
  socket.on('connect_error', (e) => console.warn('[realtime] connexion impossible :', e.message));
  return socket;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
  appointmentRooms.clear();
}

/** Écoute les changements d'une ou plusieurs tables ; retourne la fonction de désabonnement. */
export function onTableChange(tables: string | string[] | null, handler: ChangeHandler): () => void {
  const entry = { tables: tables === null ? null : Array.isArray(tables) ? tables : [tables], handler };
  handlers.add(entry);
  getSocket();
  return () => handlers.delete(entry);
}

/** Rejoint la room d'un rendez-vous (messages, position du praticien, typing). */
export function subscribeAppointment(appointmentId: string): () => void {
  appointmentRooms.set(appointmentId, (appointmentRooms.get(appointmentId) ?? 0) + 1);
  const s = getSocket();
  if (s?.connected) s.emit('subscribe:appointment', { appointmentId });
  return () => {
    const n = (appointmentRooms.get(appointmentId) ?? 1) - 1;
    if (n <= 0) {
      appointmentRooms.delete(appointmentId);
      socket?.emit('unsubscribe:appointment', { appointmentId });
    } else appointmentRooms.set(appointmentId, n);
  };
}

export function emitTyping(appointmentId: string, isTyping: boolean) {
  getSocket()?.emit('typing', { appointmentId, isTyping });
}

export function onTyping(handler: (e: { appointmentId: string; userId: string; isTyping: boolean }) => void): () => void {
  const s = getSocket();
  s?.on('typing', handler);
  return () => s?.off('typing', handler);
}

// Nouveau jeton → nouvelle connexion authentifiée ; déconnexion → fermeture.
onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') disconnectRealtime();
  else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    if (socket) {
      socket.auth = { token: getAccessToken() };
      // Modifier auth ne réauthentifie pas un socket déjà connecté.
      if (event === 'SIGNED_IN') appointmentRooms.clear();
      socket.disconnect();
      socket.connect();
    } else if (handlers.size > 0) getSocket();
  }
});
