import { LoadingSkeleton, PageHeader, SurfaceCard, TableToolbar } from "@vision/ui";

export function TenantDirectoryLoading() {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PageHeader
        eyebrow="Provisioning"
        title="Tenant Directory"
        description="Loading tenant summaries."
      />
      <SurfaceCard>
        <TableToolbar
          description="Search and filter controls load with the directory."
          title="Provisioned tenants"
        />
        <LoadingSkeleton rows={6} variant="table" />
      </SurfaceCard>
    </div>
  );
}
