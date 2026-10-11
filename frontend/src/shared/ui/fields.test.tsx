import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from "./native-select";
import { Alert } from "./alert";

describe("field compatibility", () => {
  it("associates localized labels, help and errors without converting raw drafts", () => {
    const html = renderToStaticMarkup(<Field id="price" label="价格" description="每百万" error="需要数字" required>
      {(props) => <Input {...props} name="price" type="number" value="" onChange={() => {}} />}
    </Field>);
    expect(html).toContain('for="price"');
    expect(html).toContain('id="price-help"');
    expect(html).toContain('id="price-error"');
    expect(html).toContain('aria-describedby="price-help price-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('required=""');
    expect(html).toContain('value=""');
    expect(html).not.toContain('value="0"');
    expect(renderToStaticMarkup(<Textarea name="secret" defaultValue={'{"raw":true}\n'} spellCheck={false} />)).toContain('{&quot;raw&quot;:true}\n');
  });

  it("retains tri-state and sentinel values and native listbox sizing", () => {
    const html = renderToStaticMarkup(<NativeSelect name="capability" defaultValue="null"><NativeSelectOptGroup label="能力">
      <NativeSelectOption value="null">Unknown</NativeSelectOption>
      <NativeSelectOption value="true">Yes</NativeSelectOption>
      <NativeSelectOption value="false">No</NativeSelectOption>
      <NativeSelectOption value="">Empty</NativeSelectOption>
    </NativeSelectOptGroup></NativeSelect>);
    expect(html).toContain('value="null" selected=""');
    for (const value of ["", "true", "false"]) expect(html).toContain(`value="${value}"`);
    const listbox = renderToStaticMarkup(<NativeSelect multiple size={4} defaultValue={["a"]}><NativeSelectOption value="a">A</NativeSelectOption></NativeSelect>);
    expect(listbox).toContain('multiple=""');
    expect(listbox).toContain('size="4"');
    expect(listbox).not.toContain('data-slot="native-select-icon"');
  });

  it("leaves announcement roles with the feedback owner", () => {
    expect(renderToStaticMarkup(<Alert>Static explanation</Alert>)).not.toContain('role=');
    expect(renderToStaticMarkup(<Alert role="status" aria-live="polite">Saved</Alert>)).toContain('role="status"');
  });
});
