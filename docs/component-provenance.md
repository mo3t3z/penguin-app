# Component provenance

Button, Text, Input, Card, Avatar, Badge, Separator and Skeleton were imported from the official React Native Reusables NativeWind registry on 2026-10-01:

https://github.com/founded-labs/react-native-reusables/tree/main/packages/registry/src/nativewind/components/ui

The original MIT license is preserved in `REUSABLES-LICENSE.txt`. Reusables is distributed as editable source, not a monolithic runtime UI package.

Penguin changes: local import aliases; semantic themes; typography scale; mobile touch targets; loading Button; focused/invalid and purpose-specific Input; Card variants; Avatar sizes; semantic Badge variants; static accessible Skeleton. Slot, Avatar and Separator behavior remains based on the upstream primitives.

FormField is a Penguin composition of Input and Text. Icon is a small convention wrapper around Lucide. The theme provider and development gallery are application-specific.

To add more primitives, consult https://reactnativereusables.com/docs and use the NativeWind registry. Inspect the source and dependencies before importing; do not overwrite Penguin variants without review.
