export default function FlowLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="min-h-dvh">
      {children}
    </main>
  );
}
