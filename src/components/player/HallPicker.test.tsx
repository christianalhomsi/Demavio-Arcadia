import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/lib/i18n/client";
import { HallPicker, type HallCard } from "./HallPicker";

const hall = (i: number, deviceCount: number, name = `Hall ${i}`): HallCard => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  name,
  deviceCount,
});

const view = (halls: HallCard[], locale: "en" | "ar" = "en") =>
  render(
    <I18nProvider locale={locale}>
      <HallPicker halls={halls} />
    </I18nProvider>,
  );

describe("HallPicker", () => {
  it("links a hall that has devices and only describes one that has none", () => {
    view([hall(1, 3), hall(2, 0)]);
    expect(screen.getByRole("link", { name: /Hall 1/ })).toHaveAttribute(
      "href",
      "/book/00000000-0000-4000-8000-000000000001",
    );
    expect(screen.queryByRole("link", { name: /Hall 2/ })).toBeNull();
    expect(screen.getByText("Opening soon")).toBeInTheDocument();
  });

  it("shows the three booking steps with the first one current", () => {
    view([hall(1, 1)]);
    const steps = screen.getByRole("list", { name: "Booking steps" });
    expect(steps).toHaveTextContent("Hall");
    expect(steps).toHaveTextContent("Device");
    expect(steps).toHaveTextContent("Time");
    expect(steps.querySelector("[aria-current=step]")).toHaveTextContent("Hall");
  });

  it("writes the device count in the right form in Arabic", () => {
    view([hall(1, 1), hall(2, 2), hall(3, 5), hall(4, 12)], "ar");
    for (const text of ["جهاز واحد", "جهازان", "5 أجهزة", "12 جهاز"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("offers search only with more than five halls, and filters by name", async () => {
    const { unmount } = view([hall(1, 1), hall(2, 1)]);
    expect(screen.queryByRole("searchbox")).toBeNull();
    unmount();

    view([1, 2, 3, 4, 5, 6].map((i) => hall(i, 2, i === 4 ? "Pixel Arena" : `Hall ${i}`)));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search halls" }), "pixel");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Pixel Arena/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("No hall matches your search");
  });
});
