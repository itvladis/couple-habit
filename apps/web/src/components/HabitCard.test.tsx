import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { habitView } from '../test/fixtures';
import { HabitCard } from './HabitCard';

function renderCard(overrides = {}) {
  const handlers = { onOpen: vi.fn(), onToggle: vi.fn(), onLongPress: vi.fn() };
  render(<HabitCard habit={habitView(overrides)} wide={false} {...handlers} />);
  return handlers;
}

describe('HabitCard', () => {
  it('shows the title, the frequency and today’s state for screen readers', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Зал вместе' })).toBeInTheDocument();
    expect(screen.getByText('каждый день')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ещё не отмечено сегодня/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('checks the habit without opening it', async () => {
    const { onOpen, onToggle } = renderCard();

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the habit on tap and with the keyboard', async () => {
    const { onOpen } = renderCard();
    const card = screen.getByRole('button', { name: 'Зал вместе' });

    await userEvent.click(card);
    card.focus();
    await userEvent.keyboard('{Enter}');

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('opens the menu once on a long press, even when Android also sends contextmenu', () => {
    vi.useFakeTimers();
    const { onOpen, onLongPress } = renderCard();
    const card = screen.getByRole('button', { name: 'Зал вместе' });

    fireEvent.pointerDown(card, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(500);
    fireEvent.contextMenu(card);
    fireEvent.pointerUp(card);
    fireEvent.click(card);

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('opens the menu on a right click', () => {
    const { onLongPress } = renderCard();
    const card = screen.getByRole('button', { name: 'Зал вместе' });

    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, button: 2 });
    fireEvent.contextMenu(card);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not open the menu when the check button is held', () => {
    vi.useFakeTimers();
    const { onLongPress } = renderCard();
    const check = screen.getByRole('checkbox');

    fireEvent.pointerDown(check, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(500);
    fireEvent.contextMenu(check);

    expect(onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('treats a drag as scrolling, not a long press', () => {
    vi.useFakeTimers();
    const { onLongPress } = renderCard();
    const card = screen.getByRole('button', { name: 'Зал вместе' });

    fireEvent.pointerDown(card, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(card, { clientX: 10, clientY: 40 });
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('announces the streak only when there is one', () => {
    renderCard();
    expect(screen.queryByRole('img', { name: /Серия/ })).not.toBeInTheDocument();

    renderCard({ streak: { current: 5, best: 5, unit: 'day' } });
    expect(screen.getByRole('img', { name: 'Серия: 5 дн.' })).toBeInTheDocument();
  });
});
