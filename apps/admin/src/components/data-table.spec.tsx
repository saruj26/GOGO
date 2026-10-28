import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { DataTable, type Column } from './data-table';

interface Row {
  id: string;
  name: string;
  amount: string;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (row) => row.name },
  { key: 'amount', header: 'Amount', align: 'right', cell: (row) => row.amount },
  { key: 'note', header: 'Note', secondary: true, cell: () => 'secondary' },
];

const rows: Row[] = [
  { id: '1', name: 'Bavan', amount: '2,051.46' },
  { id: '2', name: 'Chandran', amount: '1,254.83' },
];

describe('DataTable', () => {
  it('renders a real table with headers and rows', () => {
    renderWithProviders(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Name')).toBeInTheDocument();
    expect(within(table).getByText('Bavan')).toBeInTheDocument();
    expect(within(table).getByText('1,254.83')).toBeInTheDocument();
  });

  it('shows an empty state rather than an empty table', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        emptyTitle="No drivers match"
        emptyDescription="Try a different filter."
      />,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('No drivers match')).toBeInTheDocument();
  });

  it('shows an error with a retry rather than a blank grid', async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <DataTable
        columns={columns}
        rows={undefined}
        rowKey={(r) => r.id}
        error={new Error('Service unavailable')}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders placeholders while loading', () => {
    const { container } = renderWithProviders(
      <DataTable columns={columns} rows={undefined} rowKey={(r) => r.id} loading />,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  /**
   * Admin lists are paginated server-side. The control must never let somebody
   * page past the end or before the beginning.
   */
  it('disables paging past either end', () => {
    const onPageChange = vi.fn();
    const { rerender } = renderWithProviders(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pagination={{ page: 1, totalPages: 3, total: 60, onPageChange }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pagination={{ page: 3, totalPages: 3, total: 60, onPageChange }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('reports the page the user asked for', async () => {
    const onPageChange = vi.fn();
    renderWithProviders(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pagination={{ page: 2, totalPages: 5, total: 100, onPageChange }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('hides pagination when everything fits on one page', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pagination={{ page: 1, totalPages: 1, total: 2, onPageChange: vi.fn() }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('renders cards alongside the table so narrow screens stay readable', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        mobileCard={(row) => <span data-testid="card">{row.name}</span>}
      />,
    );

    // Both exist; CSS decides which is visible at a given width.
    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('reports a clicked row', async () => {
    const onRowClick = vi.fn();
    renderWithProviders(
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />,
    );

    await userEvent.click(screen.getByText('Bavan'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});
