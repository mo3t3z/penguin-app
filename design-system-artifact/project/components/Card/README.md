# Card

A contained surface for grouped content that is not a post: `card` fill, hairline `border`, `radius-md`, 16px padding.

## The consumer provides
- `variant`: `surface` (default), `outlined` (transparent), `muted` or `highlighted` (`accent` fill).
- Children built from CardHeader, CardTitle (`headline`), CardDescription (`footnote`, muted), CardContent and CardFooter.

## Rules
- Posts are never cards: they sit edge to edge on `background`. Cards have no shadow.

Hand-written from src/components/ui/card.tsx.
