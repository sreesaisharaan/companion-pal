import { Button, type ButtonProps } from '@/components/ui/button';

/**
 * The primary-action button (Add task, Add transaction, Export my data, …).
 * Solid accent fill — deliberately distinct from the light selected pills of
 * a SegmentedControl so actions never read as filters.
 */
export function CTAButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="cta" />;
}
