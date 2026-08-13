import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { CTAButton } from '@/components/ui/cta-button';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressBar } from '@/components/progress-bar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { TransactionRow } from '@/components/transaction-row';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useCurrency } from '@/hooks/use-currency';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { DEFAULT_COMPANION, STAGE_META, useCompanion } from '@/lib/api/companion';
import {
  categoryEmoji,
  DEFAULT_CATEGORIES,
  formatDayLabel,
  localDateString,
  startOfMonth,
  type MoneyRange,
  type Transaction,
  useBudgetCategories,
  useDeleteBudget,
  useDeleteTransaction,
  useMonthlyBudgets,
  useSaveBudget,
  useSaveTransaction,
  useTransactions,
} from '@/lib/api/money';

const RANGES: { value: MoneyRange; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

const MONTH_LABEL = new Date().toLocaleDateString(undefined, {
  month: 'long',
  year: 'numeric',
});

type Kind = 'expense' | 'income';

export default function MoneyScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const theme = useTheme();
  const { formatCurrency } = useCurrency();

  const [range, setRange] = useState<MoneyRange>('month');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState<string | null>(null);
  const [budgetAmountText, setBudgetAmountText] = useState('');
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const budgetMonth = localDateString(startOfMonth());

  const companion = useCompanion(userId);
  const categoriesQuery = useBudgetCategories(userId);
  const transactionsQuery = useTransactions(userId, range);
  const budgetsQuery = useMonthlyBudgets(userId, budgetMonth);
  const saveTransaction = useSaveTransaction(userId);
  const deleteTransaction = useDeleteTransaction();
  const saveBudget = useSaveBudget(userId);
  const deleteBudget = useDeleteBudget();

  const transactions = useMemo(() => transactionsQuery.data ?? [], [transactionsQuery.data]);
  const existingCategories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const total = transactions.reduce((sum, tx) => sum + tx.amount_minor, 0);

  const categoryNameById = useMemo(
    () => new Map(existingCategories.map((category) => [category.id, category.name])),
    [existingCategories],
  );

  // Monthly budgets keyed by category name, for the budget lines below.
  const budgetByCategoryName = useMemo(() => {
    const map = new Map<string, number>();
    for (const budget of budgetsQuery.data ?? []) {
      const name = categoryNameById.get(budget.category_id);
      if (name) map.set(name, budget.amount_minor);
    }
    return map;
  }, [budgetsQuery.data, categoryNameById]);
  const budgetIdByCategoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const budget of budgetsQuery.data ?? []) {
      const name = categoryNameById.get(budget.category_id);
      if (name) map.set(name, budget.id);
    }
    return map;
  }, [budgetsQuery.data, categoryNameById]);

  // Suggested = existing + defaults not yet materialised (deduped by name).
  const visibleCategories = useMemo(() => {
    const names = new Set(existingCategories.map((category) => category.name));
    const suggestions = DEFAULT_CATEGORIES.map((category) => category.name);
    return [...existingCategories.map((category) => category.name), ...suggestions.filter((name) => !names.has(name))];
  }, [existingCategories]);

  // Expense magnitudes per category (income is excluded from the bars).
  const spendByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.amount_minor >= 0) continue;
      const name = tx.category_id ? (categoryNameById.get(tx.category_id) ?? null) : null;
      const key = name ?? 'Other';
      map.set(key, (map.get(key) ?? 0) + -tx.amount_minor);
    }
    return map;
  }, [transactions, categoryNameById]);
  const maxSpend = Math.max(0, ...spendByCategory.values());

  const categoryRows = visibleCategories
    .map((name) => ({ name, emoji: categoryEmoji(name), spend: spendByCategory.get(name) ?? 0 }))
    .filter((row) => row.spend > 0);
  const otherSpend = spendByCategory.get('Other') ?? 0;

  // --- Add / edit form state ---
  const [kind, setKind] = useState<Kind>('expense');
  const [amountText, setAmountText] = useState('');
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(() => localDateString(new Date()));
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setKind('expense');
    setAmountText('');
    setCategoryName(null);
    setOccurredOn(localDateString(new Date()));
    setNote('');
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditing(tx);
    setKind(tx.amount_minor >= 0 ? 'income' : 'expense');
    setAmountText(String(Math.abs(tx.amount_minor) / 100));
    setCategoryName(tx.category_id ? (categoryNameById.get(tx.category_id) ?? null) : null);
    setOccurredOn(tx.occurred_on);
    setNote(tx.note ?? '');
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saveTransaction.isPending) return;
    setModalOpen(false);
  }

  function shiftDate(delta: number) {
    const date = new Date(`${occurredOn}T00:00:00`);
    date.setDate(date.getDate() + delta);
    setOccurredOn(localDateString(date));
  }

  function submitForm() {
    const cleaned = amountText.replace(',', '.').trim();
    const value = Number.parseFloat(cleaned);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }
    setFormError(null);
    const signed = Math.round(value * 100) * (kind === 'expense' ? -1 : 1);
    const input = {
      amountMinor: signed,
      categoryName,
      note: note || null,
      occurredOn,
    };
    saveTransaction.mutate(
      editing ? { id: editing.id, ...input } : input,
      {
        onSuccess: () => {
          setModalOpen(false);
          setEditing(null);
        },
        onError: (error) => setFormError(error.message || 'Could not save the transaction.'),
      },
    );
  }

  function openBudget(name: string) {
    setBudgetCategory(name);
    setBudgetAmountText(budgetByCategoryName.get(name) ? String(budgetByCategoryName.get(name)! / 100) : '');
    setBudgetError(null);
    setBudgetModalOpen(true);
  }

  function closeBudgetModal() {
    if (saveBudget.isPending || deleteBudget.isPending) return;
    setBudgetModalOpen(false);
  }

  function submitBudget() {
    if (!budgetCategory) return;
    const cleaned = budgetAmountText.replace(',', '.').trim();
    const value = Number.parseFloat(cleaned);
    if (!Number.isFinite(value) || value <= 0) {
      setBudgetError('Enter a budget greater than zero.');
      return;
    }
    setBudgetError(null);
    saveBudget.mutate(
      { categoryName: budgetCategory, amountMinor: Math.round(value * 100), month: budgetMonth },
      {
        onSuccess: () => setBudgetModalOpen(false),
        onError: (error) => setBudgetError(error.message || 'Could not save the budget.'),
      },
    );
  }

  function removeBudget() {
    if (!budgetCategory) return;
    const id = budgetIdByCategoryName.get(budgetCategory);
    if (!id) return;
    deleteBudget.mutate(id, {
      onSuccess: () => setBudgetModalOpen(false),
      onError: (error) => setBudgetError(error.message || 'Could not remove the budget.'),
    });
  }

  const rangeLabel = RANGES.find((option) => option.value === range)?.label ?? 'This month';
  const dateIsToday = occurredOn === localDateString(new Date());

  return (
    <Screen tabBar paddedTop>
      <ScreenHeader
        eyebrow="Companion Life"
        title="Money"
        subtitle={MONTH_LABEL}
        image={STAGE_META[(companion.data ?? DEFAULT_COMPANION).stage].image}
      />

      {/* Net total — the ONE light hero card on this screen */}
      <Card variant="primary" elevated>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.totalLabel}>
          {range === 'all' ? 'Net, all time' : `Net this ${range === 'week' ? 'week' : 'month'}`}
        </ThemedText>
        <View style={styles.totalRow}>
          <ThemedText type="title" style={styles.total}>
            {formatCurrency(total)}
          </ThemedText>
          <Chip
            label={`${transactions.length} ${transactions.length === 1 ? 'transaction' : 'transactions'}`}
            selected
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {transactions.length === 0
            ? 'Add your first transaction — totals update the moment you save one.'
            : 'Expenses count down, income counts up. No judgment, just visibility.'}
        </ThemedText>
      </Card>

      <CTAButton label="＋ Add transaction" onPress={openCreate} fullWidth />

      <SegmentedControl options={RANGES} value={range} onChange={(v) => setRange(v ?? 'month')} />

      {/* Category breakdown */}
      <SectionTitle>Categories</SectionTitle>
      <Card style={{ gap: Spacing.four }}>
        {categoryRows.length === 0 && otherSpend === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No spending in this range yet — record a transaction above to see where money goes.
          </ThemedText>
        ) : (
          <>
            {categoryRows.map((row) => (
              <CategoryBar
                key={row.name}
                emoji={row.emoji}
                name={row.name}
                spend={row.spend}
                maxSpend={maxSpend}
                budget={budgetByCategoryName.get(row.name) ?? null}
                onSetBudget={() => openBudget(row.name)}
              />
            ))}
            {otherSpend > 0 ? (
              <CategoryBar emoji={categoryEmoji(null)} name="Other" spend={otherSpend} maxSpend={maxSpend} />
            ) : null}
          </>
        )}
      </Card>

      {/* Transaction list */}
      <SectionTitle>Transactions</SectionTitle>
      {transactionsQuery.isLoading ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Loading your transactions…
          </ThemedText>
        </Card>
      ) : transactionsQuery.isError ? (
        <Card style={{ gap: Spacing.three }}>
          <ThemedText type="smallBold">Couldn’t load your transactions.</ThemedText>
          <Button label="Try again" variant="secondary" onPress={() => transactionsQuery.refetch()} fullWidth />
        </Card>
      ) : transactions.length === 0 ? (
        <Card style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold">Nothing here yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {range === 'all'
              ? 'No transactions recorded. Tap “Add transaction” to log your first one.'
              : `No transactions in ${rangeLabel.toLowerCase()}. Switch to “All time” to see everything.`}
          </ThemedText>
        </Card>
      ) : (
        <Card style={{ gap: Spacing.four }}>
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              note={tx.note}
              categoryName={tx.category_id ? (categoryNameById.get(tx.category_id) ?? null) : null}
              amountMinor={tx.amount_minor}
              occurredOn={tx.occurred_on}
              // Editing resolves the category name from the loaded categories —
              // holding it back until they resolve prevents a silent drop of
              // the transaction's category during the save.
              onEdit={categoriesQuery.isLoading ? undefined : () => openEdit(tx)}
              onDelete={() => deleteTransaction.mutate(tx.id)}
            />
          ))}
        </Card>
      )}

      {/* Budget bottom sheet */}
      <Modal
        visible={budgetModalOpen}
        transparent
        animationType="slide"
        onRequestClose={closeBudgetModal}
        statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeBudgetModal} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>
                {budgetCategory ? `Budget · ${budgetCategory}` : 'Budget'}
              </ThemedText>
              <IconButton icon="✕" size={32} onPress={closeBudgetModal} accessibilityLabel="Close" />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody}>
              <ThemedText type="small" themeColor="textSecondary">
                A monthly cap for {MONTH_LABEL}. The bar above shows how much is left.
              </ThemedText>
              <TextField
                label="Monthly budget"
                value={budgetAmountText}
                onChangeText={setBudgetAmountText}
                placeholder="0.00"
                keyboardType="decimal-pad"
                autoFocus
              />

              {budgetError ? (
                <ThemedText type="smallBold" themeColor="danger">
                  {budgetError}
                </ThemedText>
              ) : null}

              <CTAButton
                label="Save budget"
                onPress={submitBudget}
                loading={saveBudget.isPending}
                fullWidth
              />
              {budgetCategory && budgetIdByCategoryName.has(budgetCategory) ? (
                <Button
                  label="Remove budget"
                  variant="ghost"
                  onPress={removeBudget}
                  loading={deleteBudget.isPending}
                  fullWidth
                />
              ) : null}
              <Button label="Cancel" variant="ghost" onPress={closeBudgetModal} fullWidth />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add / edit bottom sheet */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
        statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>
                {editing ? 'Edit transaction' : 'New transaction'}
              </ThemedText>
              <IconButton icon="✕" size={32} onPress={closeModal} accessibilityLabel="Close" />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody}>
              <SegmentedControl
                options={[
                  { value: 'expense', label: 'Expense' },
                  { value: 'income', label: 'Income' },
                ]}
                value={kind}
                onChange={(v) => setKind(v ?? 'expense')}
              />

              <TextField
                label="Amount"
                value={amountText}
                onChangeText={setAmountText}
                placeholder="0.00"
                keyboardType="decimal-pad"
                autoFocus
              />

              <View style={{ gap: Spacing.one }}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Category
                </ThemedText>
                <SegmentedControl
                  options={visibleCategories.map((name) => ({ value: name, label: name }))}
                  value={categoryName}
                  onChange={setCategoryName}
                  deselectable
                  wrap
                />
              </View>

              <View style={{ gap: Spacing.one }}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Date
                </ThemedText>
                <View style={styles.dateRow}>
                  <IconButton
                    icon="‹"
                    variant="outlined"
                    size={34}
                    onPress={() => shiftDate(-1)}
                    accessibilityLabel="Previous day"
                  />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.dateLabel}>
                    {formatDayLabel(occurredOn)} · {occurredOn}
                  </ThemedText>
                  {dateIsToday ? (
                    <IconButton icon="›" variant="outlined" size={34} />
                  ) : (
                    <IconButton
                      icon="›"
                      variant="outlined"
                      size={34}
                      onPress={() => shiftDate(1)}
                      accessibilityLabel="Next day"
                    />
                  )}
                </View>
              </View>

              <TextField
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                placeholder="e.g. Weekly groceries run"
              />

              {formError ? (
                <ThemedText type="smallBold" themeColor="danger">
                  {formError}
                </ThemedText>
              ) : null}

              <CTAButton
                label={editing ? 'Save changes' : 'Add transaction'}
                onPress={submitForm}
                loading={saveTransaction.isPending}
                fullWidth
              />
              <Button label="Cancel" variant="ghost" onPress={closeModal} fullWidth />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function CategoryBar({
  emoji,
  name,
  spend,
  maxSpend,
  budget,
  onSetBudget,
}: {
  emoji: string;
  name: string;
  spend: number;
  maxSpend: number;
  budget?: number | null;
  onSetBudget?: () => void;
}) {
  const theme = useTheme();
  const { formatCurrency } = useCurrency();
  const pct = maxSpend > 0 ? Math.max((spend / maxSpend) * 100, spend > 0 ? 8 : 0) : 0;

  const over = budget != null && spend > budget;
  const budgetPct = budget != null ? Math.min((spend / budget) * 100, 100) : 0;

  // Category bars live on dark secondary cards — the fill is the on-fill ink
  // (onSecondary, which stays light in both schemes).
  const track = `${theme.onSecondary}26`;
  const fill = theme.onSecondary;

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.categoryRow}>
        <ThemedView type="backgroundElement" style={styles.categoryIcon}>
          <ThemedText style={styles.categoryEmoji}>{emoji}</ThemedText>
        </ThemedView>
        <ThemedText type="smallBold" style={{ flex: 1 }}>
          {name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatCurrency(spend)}
        </ThemedText>
      </View>

      <ProgressBar progress={pct / 100} height={8} track={track} fill={fill} />

      {budget != null ? (
        <View style={{ gap: Spacing.one }}>
          <ProgressBar progress={budgetPct / 100} height={4} track={track} fill={fill} />
          <Pressable
            onPress={onSetBudget}
            accessibilityRole={onSetBudget ? 'button' : undefined}
            accessibilityLabel={`Set budget for ${name}`}>
            <ThemedText
              type="small"
              themeColor={over ? 'onPrimary' : 'textSecondary'}
              style={over ? styles.overBudget : undefined}>
              {formatCurrency(spend)} of {formatCurrency(budget)}
              {over ? ` · over by ${formatCurrency(spend - budget)}` : ''}
              {'  ·  edit ›'}
            </ThemedText>
          </Pressable>
        </View>
      ) : onSetBudget ? (
        <Pressable
          onPress={onSetBudget}
          accessibilityRole="button"
          accessibilityLabel={`Set budget for ${name}`}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.budgetLink}>
            Set a {name} budget ›
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  totalLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 12,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  total: {
    fontSize: 40,
    lineHeight: 48,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 18,
  },
  overBudget: {
    fontWeight: 700,
  },
  budgetLink: {
    opacity: 0.8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '88%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
  },
  sheetBody: {
    flexGrow: 0,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dateLabel: {
    flex: 1,
  },
});
