import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Info, SlidersHorizontal, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ACTIVITY_OPTIONS,
  AUDIENCE_PRESETS,
  AUDIENCE_UNIT,
  CUSTOM_PRESET_ID,
  EPISODE_PRESETS,
  LANGUAGE_OPTIONS,
  REGION_OPTIONS,
  audiencePresetFor,
  audiencePresetValues,
  audienceRangeIsInverted,
  changedFilterCount,
  episodePresetFor,
  episodePresetValue,
  filterSummary,
  type FinderFilters,
  type FinderPreset,
} from '@/lib/finderFilters'
import { normalizePodscanQuery } from '@/lib/podcastResearch'

const FieldHint = ({ text }: { text: string }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={text} className="inline-flex cursor-help text-muted-foreground/70 hover:text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs leading-5">{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

function readOpen(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === 'open'
  } catch {
    return false
  }
}

function writeOpen(storageKey: string, open: boolean): void {
  try {
    window.localStorage.setItem(storageKey, open ? 'open' : 'closed')
  } catch {
    // Remembering the panel is a convenience; it still opens without storage.
  }
}

interface PresetChipsProps {
  label: string
  presets: FinderPreset[]
  value: string
  onValueChange: (presetId: string) => void
}

/** A single-choice chip row: radio semantics, arrow keys move between chips. */
const PresetChips = ({ label, presets, value, onValueChange }: PresetChipsProps) => (
  <ToggleGroup
    type="single"
    role="radiogroup"
    aria-label={label}
    value={value}
    // Radix lets a single group be emptied by clicking the lit chip; a filter
    // always has a value, so that click is ignored.
    onValueChange={(next) => { if (next) onValueChange(next) }}
    className="mt-1.5 flex-wrap justify-start gap-1.5"
  >
    {[...presets, { id: CUSTOM_PRESET_ID, label: 'Custom', value: '' }].map((preset) => (
      <ToggleGroupItem
        key={preset.id}
        value={preset.id}
        variant="outline"
        size="sm"
        className="h-8 rounded-full px-3 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
      >
        {preset.label}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
)

interface FinderFiltersPanelProps {
  filters: FinderFilters
  onChange: (patch: Partial<FinderFilters>) => void
  onReset: () => void
  /** The AI strategy block, which owns its own preview and regenerate calls. */
  aiStrategy: ReactNode
  /** Per user, so one person's open panel does not open everyone's. */
  storageKey: string
}

export const FinderFiltersPanel = ({ filters, onChange, onReset, aiStrategy, storageKey }: FinderFiltersPanelProps) => {
  const [open, setOpen] = useState(() => readOpen(storageKey))
  const [keywordDraft, setKeywordDraft] = useState('')
  // Custom is a mode as well as a value: choosing it with nothing typed yet
  // still has to show the inputs.
  const [audienceCustom, setAudienceCustom] = useState(() => audiencePresetFor(filters) === CUSTOM_PRESET_ID)
  const [episodesCustom, setEpisodesCustom] = useState(() => episodePresetFor(filters.minEpisodes) === CUSTOM_PRESET_ID)
  const audiencePreset = audienceCustom ? CUSTOM_PRESET_ID : audiencePresetFor(filters)
  const episodePreset = episodesCustom ? CUSTOM_PRESET_ID : episodePresetFor(filters.minEpisodes)
  const changed = changedFilterCount(filters)
  const summary = filterSummary(filters)

  const toggle = (next: boolean) => {
    setOpen(next)
    writeOpen(storageKey, next)
  }

  const reset = () => {
    setKeywordDraft('')
    setAudienceCustom(false)
    setEpisodesCustom(false)
    onReset()
  }

  const addKeyword = () => {
    const normalized = normalizePodscanQuery(keywordDraft)
    if (!normalized) return
    if (filters.customKeywords.includes(normalized)) {
      toast.info('That keyword is already in the search.')
      return
    }
    onChange({ customKeywords: [...filters.customKeywords, normalized] })
    setKeywordDraft('')
  }

  return (
    <Collapsible open={open} onOpenChange={toggle} className="rounded-xl border border-border/70 bg-muted/20">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 items-start gap-2">
          <SlidersHorizontal aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <ul aria-label="Current search settings" className="flex min-w-0 flex-wrap items-center gap-1.5">
            {summary.map((chip) => (
              <li key={chip} className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground/80">
                {chip}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {changed > 0 && (
            <Button type="button" variant="link" size="sm" className="h-8 px-2 text-xs text-foreground/75" onClick={reset}>
              Reset
            </Button>
          )}
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
              {open ? 'Hide filters' : 'Edit filters'}
              {changed > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]" aria-label={`${changed} changed`}>
                  {changed}
                </Badge>
              )}
              <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent className="space-y-5 border-t border-border/70 p-3 sm:p-4">
        <div>
          <Label htmlFor="finder-keyword" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your keywords</Label>
          <p className="mt-1 text-xs text-muted-foreground">Use quotes for exact phrases. AND / OR / NOT supported.</p>
          {filters.customKeywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.customKeywords.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="gap-1 pr-1 font-normal">
                  {keyword}
                  <button
                    type="button"
                    aria-label={`Remove keyword ${keyword}`}
                    className="rounded-full p-0.5 hover:bg-background/80"
                    onClick={() => onChange({ customKeywords: filters.customKeywords.filter((entry) => entry !== keyword) })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Input
              id="finder-keyword"
              value={keywordDraft}
              placeholder='e.g. "founder led sales" OR bootstrapping'
              className="min-w-0 sm:max-w-md"
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addKeyword()
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addKeyword} disabled={!keywordDraft.trim()}>Add</Button>
          </div>
        </div>

        {aiStrategy}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <span className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Language</Label>
            </span>
            <Select value={filters.language} onValueChange={(language) => onChange({ language })}>
              <SelectTrigger aria-label="Language" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Region</Label>
              <FieldHint text="Where the show is based. Useful when the client wants audiences in a specific market." />
            </span>
            <Select value={filters.region} onValueChange={(region) => onChange({ region })}>
              <SelectTrigger aria-label="Region" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Recency</Label>
              <FieldHint text="How recently the show must have published an episode. Inactive shows rarely book guests." />
            </span>
            <Select value={filters.activityDays} onValueChange={(activityDays) => onChange({ activityDays })}>
              <SelectTrigger aria-label="Recency" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <span className="flex items-center gap-1.5">
            <span id="finder-audience-label" className="text-xs font-medium text-muted-foreground">Audience ({AUDIENCE_UNIT})</span>
            <FieldHint text="Estimated listeners per episode, modeled from chart rank, subscribers, social following and reviews. Not measured downloads." />
          </span>
          <PresetChips
            label={`Audience, ${AUDIENCE_UNIT}`}
            presets={AUDIENCE_PRESETS}
            value={audiencePreset}
            onValueChange={(presetId) => {
              if (presetId === CUSTOM_PRESET_ID) {
                setAudienceCustom(true)
                return
              }
              setAudienceCustom(false)
              const values = audiencePresetValues(presetId)
              if (values) onChange(values)
            }}
          />
          {audiencePreset === CUSTOM_PRESET_ID && (
            <div className="mt-2 grid gap-3 sm:max-w-md sm:grid-cols-2">
              <div>
                <Label htmlFor="finder-min-audience" className="text-xs text-muted-foreground">Min audience</Label>
                <Input
                  id="finder-min-audience"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className="mt-1"
                  placeholder="Any"
                  value={filters.minAudience}
                  onChange={(event) => onChange({ minAudience: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="finder-max-audience" className="text-xs text-muted-foreground">Max audience</Label>
                <Input
                  id="finder-max-audience"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className="mt-1"
                  placeholder="Any"
                  value={filters.maxAudience}
                  onChange={(event) => onChange({ maxAudience: event.target.value })}
                />
              </div>
            </div>
          )}
          {audienceRangeIsInverted(filters) && (
            <p role="alert" className="mt-2 text-xs text-destructive">Min audience is above max audience, so no show can match.</p>
          )}
        </div>

        <div>
          <span className="text-xs font-medium text-muted-foreground">Min episodes</span>
          <PresetChips
            label="Min episodes"
            presets={EPISODE_PRESETS}
            value={episodePreset}
            onValueChange={(presetId) => {
              if (presetId === CUSTOM_PRESET_ID) {
                setEpisodesCustom(true)
                return
              }
              setEpisodesCustom(false)
              const value = episodePresetValue(presetId)
              if (value !== null) onChange({ minEpisodes: value })
            }}
          />
          {episodePreset === CUSTOM_PRESET_ID && (
            <div className="mt-2 sm:max-w-[12rem]">
              <Label htmlFor="finder-min-episodes" className="text-xs text-muted-foreground">Custom min episodes</Label>
              <Input
                id="finder-min-episodes"
                type="number"
                min="0"
                inputMode="numeric"
                className="mt-1"
                placeholder="Any"
                value={filters.minEpisodes}
                onChange={(event) => onChange({ minEpisodes: event.target.value })}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch id="finder-guests-only" checked={filters.guestsOnly} onCheckedChange={(guestsOnly) => onChange({ guestsOnly })} />
            <Label htmlFor="finder-guests-only" className="text-sm">Guest-interview shows only</Label>
          </div>
          <Button type="button" variant="ghost" size="sm" className="text-foreground/75" onClick={reset}>
            Reset to defaults
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
