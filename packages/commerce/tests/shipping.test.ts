import { describe, expect, it } from "vitest";
import { mapCourierStatus, parseIstDate } from "../src/shipping";

describe("courier status mapping", () => {
  it("maps common Shiprocket labels", () => {
    expect(mapCourierStatus("PICKED UP")).toBe("picked_up");
    expect(mapCourierStatus("In Transit")).toBe("in_transit");
    expect(mapCourierStatus("REACHED AT DESTINATION HUB")).toBe("in_transit");
    expect(mapCourierStatus("OUT FOR DELIVERY")).toBe("out_for_delivery");
    expect(mapCourierStatus("DELIVERED")).toBe("delivered");
    expect(mapCourierStatus("UNDELIVERED")).toBe("failed_attempt");
    expect(mapCourierStatus("RTO INITIATED")).toBe("returned_to_origin");
    expect(mapCourierStatus("RTO DELIVERED")).toBe("returned_to_origin"); // not a customer delivery
    expect(mapCourierStatus("Manifest generated")).toBeNull();
  });
  it("reads courier timestamps as IST", () => {
    expect(parseIstDate("2026-11-07 10:30:00").toISOString()).toBe("2026-11-07T05:00:00.000Z");
    expect(parseIstDate("2026-11-07 10:30").toISOString()).toBe("2026-11-07T05:00:00.000Z");
  });
});
