import { PatternMessagesPage } from '../../patterns/H5PatternPages';
import type { CommunityNotification } from '../../community/communityData';

export function CommunityMessagesPage({ isLoggedIn, notifications, openNotification, openLogin }: {
  isLoggedIn: boolean;
  notifications: CommunityNotification[];
  openNotification: (notification: CommunityNotification) => void;
  openLogin: () => void;
}) {
  return <PatternMessagesPage
    isLoggedIn={isLoggedIn}
    notifications={notifications}
    onLogin={openLogin}
    onOpenNotification={openNotification}
  />;
}
