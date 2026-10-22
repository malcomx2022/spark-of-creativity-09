import { createContext, useContext } from 'react';

interface UserTypeContextValue {
  isPractitioner: boolean | undefined;
  isLoading: boolean;
  error: Error | null;
}

export const UserTypeContext = createContext<UserTypeContextValue>({
  isPractitioner: undefined,
  isLoading: false,
  error: null
});

export const useUserType = () => useContext(UserTypeContext);
