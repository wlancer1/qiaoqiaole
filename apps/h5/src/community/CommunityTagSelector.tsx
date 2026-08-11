import { COMMUNITY_TAGS, normalizeSelectedTags, type CommunityTag } from './communityTags';

export function CommunityTagSelector({ value, onChange, disabled = false }: { value: readonly string[]; onChange: (tags: CommunityTag[]) => void; disabled?: boolean }) {
  const selected = normalizeSelectedTags(value);
  return (
    <div className="community-tag-selector" aria-label="作品标签">
      {COMMUNITY_TAGS.map((tag) => {
        const isSelected = selected.includes(tag);
        const selectionFull = selected.length >= 3 && !isSelected;
        return <button
          key={tag}
          type="button"
          aria-label={`选择标签 ${tag}`}
          aria-pressed={isSelected}
          disabled={disabled || selectionFull}
          className={isSelected ? 'is-selected' : ''}
          onClick={() => onChange(isSelected ? selected.filter((item) => item !== tag) : [...selected, tag])}
        >{tag}</button>;
      })}
    </div>
  );
}
