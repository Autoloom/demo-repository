/**
 * Order board — every order by stage, with the documents it has and the gate it is waiting at.
 * See lib/domain/board.ts for what it is for and what it deliberately is not.
 */
import { OrderBoardClient } from "./OrderBoardClient";

export default function OrdersPage() {
  return <OrderBoardClient />;
}
