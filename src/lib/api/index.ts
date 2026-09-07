export { api, ApiError, API_BASE_URL, errorMessage, isApiError, request } from './client';
export { auth } from './auth';
export type { Me, AppRole, AdminRole, SignUpInput, SignUpResult, AuthSession, AuthUser, AuthEvent } from './auth';
export { getSession, getAccessToken, getCurrentUser, onAuthStateChange } from './session';
export { onTableChange, subscribeAppointment, emitTyping, onTyping, disconnectRealtime, getSocket } from './realtime';
export type { ChangeEvent, ChangeHandler } from './realtime';
export type { StorageFolder, UploadResult } from './files';
export { uploadFile, uploadFileBase64, getSignedFileUrl, fileToBase64, fileToDataUrl } from './files';
