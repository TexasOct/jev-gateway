import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import "../../src/styles/index.css";
import { applyPalette, buildPalette } from "../../src/shared/theme/palette";
import { Button } from "../../src/shared/ui/button";
import { Input } from "../../src/shared/ui/input";
import { Textarea } from "../../src/shared/ui/textarea";
import { NativeSelect, NativeSelectOption } from "../../src/shared/ui/native-select";
import { Checkbox } from "../../src/shared/ui/checkbox";
import { Field } from "../../src/shared/ui/Field";
import { Badge } from "../../src/shared/ui/badge";
import { Alert, AlertDescription } from "../../src/shared/ui/alert";

const params = new URLSearchParams(location.search);
applyPalette(buildPalette("#3b66d9")[params.get("scheme") === "dark" ? "dark" : "light"], document.documentElement);

export function Fixture() {
  const input = useRef<HTMLInputElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const checkbox = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [capability, setCapability] = useState("null");
  const [checked, setChecked] = useState(false);
  const [submissions, setSubmissions] = useState(0);
  const [values, setValues] = useState("");
  const [events, setEvents] = useState("");
  return <main className="mx-auto grid max-w-xl gap-4 p-4">
    <form className="grid min-w-0 gap-4" onSubmit={(event) => {
      event.preventDefault(); setSubmissions((value) => value + 1);
      setValues(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))));
    }}>
      <Field id="draft" label="Price / 价格" description="Raw numeric draft" error="Synthetic invalid state">
        {(props) => <Input {...props} ref={input} name="draft" type="number" value={draft} onChange={(event) => { setDraft(event.target.value); setEvents(`${event.currentTarget.tagName}:${event.target.value}`); }} />}
      </Field>
      <Field id="capability" label="Capability / 能力">
        {(props) => <NativeSelect {...props} ref={select} name="capability" value={capability} onChange={(event) => { setCapability(event.target.value); setEvents(`${event.currentTarget.tagName}:${event.target.value}`); }}>
          <NativeSelectOption value="null">Unknown</NativeSelectOption><NativeSelectOption value="true">Yes</NativeSelectOption><NativeSelectOption value="false">No</NativeSelectOption><NativeSelectOption value="">Empty</NativeSelectOption>
        </NativeSelect>}
      </Field>
      <Textarea aria-label="Instructions" name="instructions" defaultValue="raw instructions" />
      <label className="flex items-center gap-2"><Checkbox ref={checkbox} name="review" value="accepted" checked={checked} indeterminate={!checked} onChange={(event) => { setChecked(event.target.checked); setEvents(`${event.currentTarget.tagName}:${event.target.checked}`); }} />Review</label>
      <Button variant="outline" onClick={() => { input.current?.focus(); }}>Focus input</Button>
      <Button variant="outline" onClick={() => { select.current?.focus(); }}>Focus select</Button>
      <Button variant="outline" onClick={() => { checkbox.current?.focus(); }}>Focus review</Button>
      <Button type="submit">Submit</Button>
      <fieldset className="min-w-0" disabled><Input aria-label="Disabled field" name="disabled" defaultValue="excluded" /><Button>Disabled action</Button></fieldset>
    </form>
    <Badge variant="destructive">Conflict</Badge>
    <Alert role="status"><AlertDescription>Caller-owned status</AlertDescription></Alert>
    <output data-testid="submissions">{submissions}</output><output className="min-w-0 break-all" data-testid="values">{values}</output><output className="min-w-0 break-all" data-testid="events">{events}</output>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
