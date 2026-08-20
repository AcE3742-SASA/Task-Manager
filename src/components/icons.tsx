// design/mockup-v1.html 의 nav / iconset SVG 를 그대로 옮긴 것.
// viewBox 24, fill 없음, stroke 는 CSS(currentColor 또는 var(--ink))가 정한다.

export const IconList = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)

export const IconCalendar = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" />
  </svg>
)

export const IconPlus = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconGear = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3.3" />
    <circle cx="12" cy="12" r="7.4" />
    <path d="M12 2.1v2.5M12 19.4v2.5M21.9 12h-2.5M4.6 12H2.1M19 5l-1.8 1.8M6.8 17.2 5 19M19 19l-1.8-1.8M6.8 6.8 5 5" />
  </svg>
)

export const IconPerson = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </svg>
)

export const IconSignOut = () => (
  <svg viewBox="0 0 24 24">
    <path d="M15 4h5v16h-5M12 8l4 4-4 4M16 12H4" />
  </svg>
)

export const IconArrow = () => (
  <svg viewBox="0 0 24 24">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
