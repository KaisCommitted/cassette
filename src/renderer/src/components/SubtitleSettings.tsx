import type { Settings, SubtitleStyle } from '@shared/types'

export interface SubtitleSettingsProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
}

export function SubtitleSettings({ settings, onChange }: SubtitleSettingsProps) {
  const style = settings.subtitleStyle
  const patchStyle = (changes: Partial<SubtitleStyle>): void =>
    onChange({ subtitleStyle: { ...style, ...changes } })

  return (
    <>
      <h2 className="section-title">Subtitles</h2>

      <div className="field">
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.autoEnableSubtitles}
            onChange={(e) => onChange({ autoEnableSubtitles: e.target.checked })}
          />
          Turn subtitles on automatically
        </label>
        <p className="field-help">
          Picks a track in your preferred language when the file has one, and skips
          signs-only and forced tracks. Many releases mark no default track, which is
          why subtitles otherwise stay off.
        </p>
      </div>

      <div className="field">
        <div className="field-label">Preferred subtitle languages</div>
        <input
          className="search"
          value={settings.preferredSubtitleLanguages.join(', ')}
          onChange={(e) =>
            onChange({
              preferredSubtitleLanguages: splitLanguages(e.target.value)
            })
          }
        />
        <p className="field-help">
          In order of preference, e.g. <code>eng, fre</code>. Two- and three-letter
          codes both work.
        </p>
      </div>

      <div className="field">
        <div className="field-label">Preferred audio languages</div>
        <input
          className="search"
          value={settings.preferredAudioLanguages.join(', ')}
          onChange={(e) =>
            onChange({ preferredAudioLanguages: splitLanguages(e.target.value) })
          }
        />
      </div>

      <h2 className="section-title">Subtitle appearance</h2>

      <div className="sub-preview">
        <span
          style={{
            display: 'inline-block',
            padding: style.backgroundOpacity > 0 ? '4px 10px' : 0,
            background:
              style.backgroundOpacity > 0
                ? `rgba(0,0,0,${style.backgroundOpacity})`
                : 'transparent',
            color: style.color,
            fontSize: `${18 * style.scale}px`,
            fontWeight: 600,
            textShadow:
              style.outlineSize > 0
                ? `0 0 ${style.outlineSize * 1.6}px ${style.outlineColor},
                   0 0 ${style.outlineSize}px ${style.outlineColor}`
                : 'none'
          }}
        >
          The quick brown fox jumps over the lazy dog
        </span>
      </div>

      <div className="field">
        <div className="range-row">
          <label htmlFor="sub-scale">Size</label>
          <input
            id="sub-scale"
            type="range"
            min={0.5}
            max={2.5}
            step={0.05}
            value={style.scale}
            onChange={(e) => patchStyle({ scale: Number(e.target.value) })}
          />
          <span className="value">{style.scale.toFixed(2)}×</span>
        </div>

        <div className="range-row">
          <label htmlFor="sub-outline">Outline</label>
          <input
            id="sub-outline"
            type="range"
            min={0}
            max={6}
            step={0.5}
            value={style.outlineSize}
            onChange={(e) => patchStyle({ outlineSize: Number(e.target.value) })}
          />
          <span className="value">{style.outlineSize}</span>
        </div>

        <div className="range-row">
          <label htmlFor="sub-bg">Background</label>
          <input
            id="sub-bg"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={style.backgroundOpacity}
            onChange={(e) => patchStyle({ backgroundOpacity: Number(e.target.value) })}
          />
          <span className="value">{Math.round(style.backgroundOpacity * 100)}%</span>
        </div>

        <div className="range-row">
          <label htmlFor="sub-margin">Lift off bottom</label>
          <input
            id="sub-margin"
            type="range"
            min={0}
            max={30}
            step={1}
            value={style.marginPercent}
            onChange={(e) => patchStyle({ marginPercent: Number(e.target.value) })}
          />
          <span className="value">{style.marginPercent}%</span>
        </div>

        <div className="range-row">
          <label htmlFor="sub-color">Text colour</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              id="sub-color"
              className="swatch"
              type="color"
              value={style.color}
              onChange={(e) => patchStyle({ color: e.target.value })}
            />
            <input
              className="swatch"
              type="color"
              aria-label="Outline colour"
              value={style.outlineColor}
              onChange={(e) => patchStyle({ outlineColor: e.target.value })}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>text, outline</span>
          </div>
          <span />
        </div>
      </div>

      <div className="field">
        <label className="toggle">
          <input
            type="checkbox"
            checked={style.overrideEmbeddedStyles}
            onChange={(e) => patchStyle({ overrideEmbeddedStyles: e.target.checked })}
          />
          Apply these to embedded styled subtitles too
        </label>
        <p className="field-help">
          Off by default. Everything above always applies to subtitle files. Embedded
          ASS subtitles carry their own fonts and positioning, and forcing them into
          one style breaks signs and karaoke — turn this on only if you would rather
          have consistency.
        </p>
      </div>
    </>
  )
}

function splitLanguages(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}
