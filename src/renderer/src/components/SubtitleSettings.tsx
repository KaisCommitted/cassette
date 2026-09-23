import type { CSSProperties } from 'react'
import type { Settings, SubtitleStyle } from '@shared/types'
import { Backdrop } from './Art'
import { DraftInput, Section, SwitchRow } from './SettingsParts'

export interface SubtitleSettingsProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
  /** A TMDB backdrop from the library to preview subtitles over. */
  previewArt: string | null
}

export function SubtitleSettings({ settings, onChange, previewArt }: SubtitleSettingsProps) {
  const style = settings.subtitleStyle
  const patchStyle = (changes: Partial<SubtitleStyle>): void =>
    onChange({ subtitleStyle: { ...style, ...changes } })

  return (
    <>
      <Section id="subtitles" title="Subtitles">
        <SwitchRow
          label="Turn subtitles on automatically"
          help="Picks a track in your preferred language when the file has one, and skips signs-only and forced tracks. Many releases mark no default track, which is why subtitles otherwise stay off."
          checked={settings.autoEnableSubtitles}
          onChange={(v) => onChange({ autoEnableSubtitles: v })}
        />

        <div className="setting-row">
          <span className="setting-text">
            <label className="setting-label" htmlFor="sub-langs">
              Preferred subtitle languages
            </label>
            <span className="setting-help">
              In order of preference, separated by commas, e.g. <code>eng, fre</code>. Two- and
              three-letter codes both work.
            </span>
          </span>
          <DraftInput
            id="sub-langs"
            className="setting-input"
            spellCheck={false}
            value={settings.preferredSubtitleLanguages.join(', ')}
            onCommit={(v) => onChange({ preferredSubtitleLanguages: splitLanguages(v) })}
          />
        </div>

        <div className="setting-row">
          <span className="setting-text">
            <label className="setting-label" htmlFor="audio-langs">
              Preferred audio languages
            </label>
            <span className="setting-help">Used to choose an audio track when a file has several.</span>
          </span>
          <DraftInput
            id="audio-langs"
            className="setting-input"
            spellCheck={false}
            value={settings.preferredAudioLanguages.join(', ')}
            onCommit={(v) => onChange({ preferredAudioLanguages: splitLanguages(v) })}
          />
        </div>

        <SwitchRow
          label="Fetch every language you listed, not just the first"
          help="Leaves each episode with one subtitle track per language, so you can switch between them from the player's Subtitles menu."
          checked={settings.downloadEveryPreferredLanguage}
          onChange={(v) => onChange({ downloadEveryPreferredLanguage: v })}
        />
      </Section>

      <Section id="appearance" title="Subtitle appearance">
        <div className="appearance">
          <div className="appearance-controls">
            <Slider
              id="sub-scale"
              label="Size"
              min={0.5}
              max={2.5}
              step={0.05}
              value={style.scale}
              display={`${style.scale.toFixed(2)}×`}
              onChange={(v) => patchStyle({ scale: v })}
            />
            <Slider
              id="sub-outline"
              label="Outline"
              min={0}
              max={6}
              step={0.5}
              value={style.outlineSize}
              display={String(style.outlineSize)}
              onChange={(v) => patchStyle({ outlineSize: v })}
            />
            <Slider
              id="sub-bg"
              label="Background"
              min={0}
              max={1}
              step={0.05}
              value={style.backgroundOpacity}
              display={`${Math.round(style.backgroundOpacity * 100)}%`}
              onChange={(v) => patchStyle({ backgroundOpacity: v })}
            />
            <Slider
              id="sub-margin"
              label="Lift off bottom"
              min={0}
              max={30}
              step={1}
              value={style.marginPercent}
              display={`${style.marginPercent}%`}
              onChange={(v) => patchStyle({ marginPercent: v })}
            />

            <div className="swatches">
              <label className="swatch-field">
                <input
                  type="color"
                  className="swatch"
                  value={style.color}
                  onChange={(e) => patchStyle({ color: e.target.value })}
                />
                Text colour
              </label>
              <label className="swatch-field">
                <input
                  type="color"
                  className="swatch"
                  value={style.outlineColor}
                  onChange={(e) => patchStyle({ outlineColor: e.target.value })}
                />
                Outline colour
              </label>
            </div>
          </div>

          <SubtitlePreview style={style} art={previewArt} />
        </div>

        <SwitchRow
          label="Apply these to embedded styled subtitles too"
          help="Off by default. Everything above always applies to subtitle files. Embedded ASS subtitles carry their own fonts and positioning, and forcing them into one style breaks signs and karaoke — turn this on only if you would rather have consistency."
          checked={style.overrideEmbeddedStyles}
          onChange={(v) => patchStyle({ overrideEmbeddedStyles: v })}
        />
      </Section>
    </>
  )
}

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  display,
  onChange
}: {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (value: number) => void
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output htmlFor={id} className="slider-value">
        {display}
      </output>
    </div>
  )
}

/**
 * The line as it will look over a picture, not over a flat box: outline and
 * background only mean something against an image. Sizes are in units of the
 * preview's width, so it is a scale model of a full-width player.
 */
function SubtitlePreview({ style, art }: { style: SubtitleStyle; art: string | null }) {
  // The stroke is centred on the glyph edge and half of it sits under the
  // fill, so it is drawn at twice the width that should show.
  const outline = style.outlineSize * 0.3
  return (
    <div className="sub-preview" aria-label="Preview">
      <Backdrop path={art} />
      <span
        className="sub-preview-line"
        style={{
          bottom: `${4 + style.marginPercent}%`,
          color: style.color,
          fontSize: `${3.6 * style.scale}cqi`,
          background:
            style.backgroundOpacity > 0 ? `rgba(0, 0, 0, ${style.backgroundOpacity})` : 'transparent',
          padding: style.backgroundOpacity > 0 ? '0.15em 0.5em' : 0,
          WebkitTextStroke: outline > 0 ? `${outline}cqi ${style.outlineColor}` : undefined,
          paintOrder: 'stroke fill'
        }}
      >
        We should have left on the last train.
      </span>
    </div>
  )
}

function splitLanguages(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}
