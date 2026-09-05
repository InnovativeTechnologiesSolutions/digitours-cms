import React from 'react';

export const metadata = {
  title: 'DigiTours CMS',
  description: 'Admin Portal for DigiTours',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
