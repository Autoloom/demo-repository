/**
 * Review GTPs — the records list + detail/sign-off view.
 *
 * This is where the "Order GTPs" list, the board format templates, and the per-GTP editing and
 * stamping UI live. It used to sit on the /gtp tab itself, which buried the tab's three choices.
 */
import { GtpRecordsClient } from "./GtpRecordsClient";

export default function ReviewGtpsPage() {
  return <GtpRecordsClient />;
}
