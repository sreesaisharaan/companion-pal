import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';

type SegmentedOption<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  /** Currently selected value, or null (only possible with `deselectable`). */
  value: T | null;
  onChange: (value: T | null) => void;
  /** Tapping the selected option clears the selection. */
  deselectable?: boolean;
  /** Allow the pills to wrap onto multiple lines (category filters). */
  wrap?: boolean;
};

/**
 * A row of mutually-exclusive filter/segmented pills built on Chip. Selected
 * pills use the light `chipSelected` fill; unselected use the dark outline.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  deselectable,
  wrap,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.row, wrap && styles.wrap]}>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={value === option.value}
          onPress={() => {
            if (deselectable && value === option.value) {
              onChange(null);
            } else {
              onChange(option.value);
            }
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  wrap: {
    flexWrap: 'wrap',
  },
});
