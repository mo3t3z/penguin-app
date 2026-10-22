# Input

The text field: 48px high, `card` fill, a 1.5px `input` outline, 2px `focus` when focused and 2px `destructive` when invalid.

## The consumer provides
- Standard text-input props (value, onChangeText, placeholder…).
- `variant`: `default`, `search` (adds the magnifier and a clear button, no autocapitalise or autocorrect) or `multiline` (starts at 112px and grows).
- `leadingIcon`: a 20px Lucide icon; `trailing`: a control after the text, such as show/hide password.
- `invalid`; `editable={false}` turns the fill `muted`.

## Rules
- Corners `radius-md`; text `body`; placeholder `muted-foreground`; selection colour `primary`.
- The chat composer uses the same field with `radius-xl`.

Hand-written from src/components/ui/input.tsx.
