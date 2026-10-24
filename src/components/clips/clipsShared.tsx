/** The placeholder person: a head and shoulders. Decorative everywhere it appears. */
export const Silhouette = ({ fill, className }: { fill: string; className?: string }) => (
  <svg viewBox="0 0 120 110" width="110" height="100" className={className} aria-hidden="true" focusable="false">
    <circle cx="60" cy="38" r="26" fill={fill} />
    <path d="M10 110 C10 78 34 66 60 66 C86 66 110 78 110 110 Z" fill={fill} />
  </svg>
)

interface IconProps { size?: number; stroke?: string; width?: number }

const iconProps = ({ size = 28, stroke = '#c8f542', width = 1.8 }: IconProps) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: width,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false,
})

export const ScissorsIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
)
export const LinkIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  </svg>
)
export const CheckCircleIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)
export const SendIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)
export const CheckIcon = (props: IconProps) => (
  <svg {...iconProps({ size: 20, width: 2.2, ...props })}><polyline points="20 6 9 17 4 12" /></svg>
)
export const XIcon = (props: IconProps) => (
  <svg {...iconProps({ size: 20, width: 2.2, stroke: '#7a7a76', ...props })}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
