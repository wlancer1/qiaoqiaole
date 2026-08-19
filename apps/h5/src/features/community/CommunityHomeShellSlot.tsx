import { useLocation, useNavigate } from 'react-router-dom';
import { HomeShellPage } from '../../pages/home/HomeShellPage';
import { CommunityMessagesPage } from './CommunityMessagesPage';
import { useCommunityFeature } from './CommunityFeatureProvider';
import { useCommunityHomeAdapter } from './useCommunityHomeAdapter';
import { useSplitFeature } from '../split/SplitFeatureProvider';
import { useAppSelector } from '../../store/hooks';
import { selectAuthUserId } from '../../store/auth/authSlice';
import { xhsPreviewSrc } from '../../utils/h5AppUtils';

/** Feature-owned adapter for the community portions of the shared home shell. */
export function CommunityHomeShellSlot(homeProps: Record<string, any>) {
  const location = useLocation();
  const navigate = useNavigate();
  const { domain, discovery, actions } = useCommunityFeature();
  const currentUserId = useAppSelector(selectAuthUserId);
  const split = useSplitFeature();
  const home = useCommunityHomeAdapter({ domain, currentUserId, navigate, pathname: location.pathname, search: location.search, route: discovery });
  return <HomeShellPage
    {...homeProps}
    fileInputRef={split.fileInputRef}
    handleUpload={split.openFromUpload}
    openUpload={split.openUpload}
    showUploadModal={split.showUploadModal}
    closeUploadModal={split.closeUploadModal}
    showXhsInput={split.showXhsInput}
    setShowXhsInput={split.setShowXhsInput}
    xhsLink={split.xhsLink}
    setXhsLink={split.setXhsLink}
    xhsExtractedImages={split.xhsExtractedImages}
    isExtractingXhs={split.isExtractingXhs}
    chooseLocalDrawing={split.chooseLocalDrawing}
    extractXiaohongshuImage={split.extractXiaohongshuImage}
    importXhsImage={split.importXhsImage}
    showXhsImagePicker={split.showXhsImagePicker}
    closeXhsImagePicker={split.closeXhsImagePicker}
    isImportingXhsImage={split.isImportingXhsImage}
    isImportingLocalImage={split.isImportingLocalImage}
    xhsExtractedTitle={split.xhsExtractedTitle}
    xhsPreviewSrc={xhsPreviewSrc}
    {...home}
    openBlankCanvasCreation={() => { split.closeUploadModal(); homeProps.openBlankCanvasCreation(); }}
    communityMessagesPage={<CommunityMessagesPage
      isLoggedIn={homeProps.isLoggedIn}
      notifications={domain.notifications}
      openNotification={domain.openNotification}
      openLogin={actions.requestLogin}
    />}
  />;
}
