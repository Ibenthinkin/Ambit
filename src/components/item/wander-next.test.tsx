// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { takeArrival } from "~/lib/item-arrival";
import { WanderNext } from "./wander-next";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const rows = [
  { id: "a", title: "First", reason: "because" },
  { id: "b", title: "Second", reason: "since" },
];

describe("WanderNext layout=wide", () => {
  it("numbers the rows from 01 and shows the count in the header", () => {
    const { container } = render(<WanderNext rows={rows} layout="wide" />);
    expect(screen.getAllByText("02")).toHaveLength(2); // header count + row 02
    const nums = [...container.querySelectorAll("li a > span:first-child")].map(
      (n) => n.textContent,
    );
    expect(nums).toEqual(["01", "02"]);
    expect(screen.getByRole("link", { name: /First/ })).toHaveAttribute(
      "href",
      "/i/a",
    );
  });
});

describe("WanderNext arrival", () => {
  it("leaves a wander note for the item a row opens", () => {
    sessionStorage.clear();
    render(<WanderNext rows={rows} />);
    fireEvent.click(screen.getByRole("link", { name: /Second/ }));
    expect(takeArrival("b")).toBe("wander");
  });
});
