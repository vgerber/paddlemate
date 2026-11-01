import FilterChip from "@/components/search/FilterChip";

/** One choice out of several as chips; tapping the chosen one clears it. */
export default function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: readonly T[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  labelOf: (value: T) => string;
}) {
  return options.map((option) => (
    <FilterChip
      key={option}
      plain
      label={labelOf(option)}
      set={value === option}
      onClick={() => onChange(value === option ? undefined : option)}
    />
  ));
}
