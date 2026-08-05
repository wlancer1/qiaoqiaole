import {
  ArrowLeft,
  Bell,
  Brush,
  Compass,
  Crop,
  Eraser,
  Folder,
  Grid2X2,
  Hand,
  House,
  Layers3,
  MessageCircle,
  PaintBucket,
  Pipette,
  Plus,
  Settings,
  Share2,
  Shapes,
  Sparkles,
  Upload,
  UserRound,
  CircleHelp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { IconName } from './h5Types';

const iconMap: Record<IconName, LucideIcon> = {
  'arrow-left': ArrowLeft,
  bell: Bell,
  brush: Brush,
  category: Grid2X2,
  crop: Crop,
  eraser: Eraser,
  eyedropper: Pipette,
  fill: PaintBucket,
  folder: Folder,
  help: CircleHelp,
  home: House,
  discover: Compass,
  hand: Hand,
  layers: Layers3,
  message: MessageCircle,
  plus: Plus,
  profile: UserRound,
  settings: Settings,
  share: Share2,
  shape: Shapes,
  spark: Sparkles,
  upload: Upload,
};

export function Icon({ name }: { name: IconName }) {
  const LibraryIcon = iconMap[name];
  return <LibraryIcon className="ui-icon" aria-hidden="true" strokeWidth={2} />;
}
