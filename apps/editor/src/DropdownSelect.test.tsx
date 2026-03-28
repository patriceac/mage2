import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DropdownSelect } from "./DropdownSelect";

describe("DropdownSelect", () => {
  it("renders the shared non-editable dropdown shell around a native select", () => {
    const markup = renderToStaticMarkup(
      <DropdownSelect aria-label="Category">
        <option value="background">Background</option>
      </DropdownSelect>
    );

    expect(markup).toContain('class="dropdown-select"');
    expect(markup).toContain('class="dropdown-select__native"');
    expect(markup).toContain('aria-label="Category"');
    expect(markup).toContain('class="dropdown-select__trigger"');
  });

  it("marks the wrapper disabled when the control is disabled", () => {
    const markup = renderToStaticMarkup(
      <DropdownSelect disabled defaultValue="">
        <option value="">None</option>
      </DropdownSelect>
    );

    expect(markup).toContain("dropdown-select dropdown-select--disabled");
    expect(markup).toContain("disabled");
  });
});
