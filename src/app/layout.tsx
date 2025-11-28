/**
 * DPaC Widgets - Root Layout
 * Layout minimal sans dépendances externes
 * Conçu pour être léger et embarquable sur des sites externes
 */

export const metadata = {
  title: 'DPaC Widgets',
  description: 'DPaC Chat Widget System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: 'transparent',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  )
}

