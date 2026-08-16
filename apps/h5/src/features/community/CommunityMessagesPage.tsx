import { PatternMessagesPage } from '../../patterns/H5PatternPages';
import type { CommunityNotification } from '../../community/communityData';

export function CommunityMessagesPage({ isLoggedIn, notifications, openNotification, setActiveTab, openUpload, openLogin }: {
  isLoggedIn: boolean;
  notifications: CommunityNotification[];
  openNotification: (notification: CommunityNotification) => void;
  setActiveTab: (tab: 'home' | 'discover' | 'profile') => void;
  openUpload: (mode: 'bead') => void;
  openLogin: () => void;
}) {
  return <PatternMessagesPage
    isLoggedIn={isLoggedIn}
    notifications={notifications}
    onHome={() => setActiveTab('home')}
    onDiscover={() => setActiveTab('discover')}
    onUpload={() => openUpload('bead')}
    onProfile={() => setActiveTab('profile')}
    onLogin={openLogin}
    onOpenNotification={openNotification}
  />;
}
