import { DispatcherCarrierPortalPage } from "@/components/freight/DispatcherCarrierPortalPage";
import { DispatcherStaffDocUpload } from "@/components/freight/DispatcherStaffDocUpload";

export default function Page() {
  return (
    <>
      <DispatcherCarrierPortalPage />
      <div className="p-4 pt-0 sm:p-6 sm:pt-0 lg:p-8 lg:pt-0">
        <DispatcherStaffDocUpload />
      </div>
    </>
  );
}
