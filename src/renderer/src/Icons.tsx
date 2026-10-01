export function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    folder: <path d="M3 7V5h6l2 2h10v13H3V7Zm0 3h18" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6.5" />
        <path d="m15 15 6 6" />
      </>
    ),
    code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" />,
    settings: (
      <>
        <path d="M3 6h18M3 12h18M3 18h18" />
        <path d="M8 3v6m8 0v6M9 15v6" />
      </>
    ),
    build: <path d="m4 21 10-11m-3-6 4-2 6 6-3 3-4-4-3-3Zm-7 17-2-2" />,
    run: <path d="m7 4 14 8-14 8V4Z" />,
    terminal: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m5 8 4 4-4 4m7 0h6" />
      </>
    ),
    file: <path d="M5 2h9l5 5v15H5V2Zm9 0v6h5" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    save: (
      <>
        <path d="M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7" />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="3" width="18" height="18" />
        <path d="M16 3v18" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5 8a7 7 0 0 1 12-3l3 4M4 15l3 4a7 7 0 0 0 12-3" />
      </>
    ),
    stop: <rect x="5" y="5" width="14" height="14" />,
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.file}
    </svg>
  )
}
