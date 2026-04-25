import { BrandLockup, InlineNotice, SectionHeading, SurfaceCard } from "@vision/ui";

export default function ErpHomePage() {
  return (
    <main className="erp-page">
      <SurfaceCard tone="accent">
        <BrandLockup logoSrc="/main_logo.svg" title="Vision" subtitle="ERP Surface" />
        <SectionHeading
          eyebrow="Foundation"
          title="Tenant ERP entry remains intentionally narrow in Phase 10."
          description="Owner activation is now the live ERP-facing path. Broader ERP workflows stay outside this phase until tenant provisioning and trust boundaries are complete."
        />
        <InlineNotice
          tone="neutral"
          title="Active ERP slice"
          description="Use the secure owner activation route to bootstrap tenant-owner credentials and complete MFA enrollment."
        />
      </SurfaceCard>
    </main>
  );
}
