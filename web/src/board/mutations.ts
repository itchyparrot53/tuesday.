import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { undoStack } from '../lib/undo';
import type { BoardFull, Column, Group, Item, View, ViewType } from '../../../shared/types';
import type { CellValue } from '../../../shared/columns';

export function withoutKey<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next = { ...obj };
  delete next[key];
  return next;
}

export function useSetValue(boardId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { itemId: number; columnId: number; value: unknown }) =>
      api<{ item: Item }>('PUT', `/items/${input.itemId}/values/${input.columnId}`, {
        value: input.value,
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['items', boardId] });
      const prev = qc.getQueryData<Item[]>(['items', boardId]);
      qc.setQueryData<Item[]>(['items', boardId], (items) =>
        items?.map((it) =>
          it.id !== input.itemId
            ? it
            : {
                ...it,
                values:
                  input.value === null
                    ? withoutKey(it.values, String(input.columnId))
                    : {
                        ...it.values,
                        [String(input.columnId)]: input.value as CellValue,
                      },
              },
        ),
      );
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(['items', boardId], ctx.prev);
      toast.show((err as Error).message, 'error');
    },
    onSuccess: (_data, input, ctx) => {
      const previous = ctx?.prev?.find((item) => item.id === input.itemId)?.values[
        String(input.columnId)
      ];
      undoStack.push({
        label: 'Cell changed',
        undo: async () => {
          await api('PUT', `/items/${input.itemId}/values/${input.columnId}`, {
            value: previous ?? null,
          });
          await qc.invalidateQueries({ queryKey: ['items', boardId] });
          await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'item' });
        },
        redo: async () => {
          await api('PUT', `/items/${input.itemId}/values/${input.columnId}`, {
            value: input.value,
          });
          await qc.invalidateQueries({ queryKey: ['items', boardId] });
        },
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['items', boardId] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'item' });
    },
  });
}

export function useUpdateItem(boardId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: {
      itemId: number;
      name?: string;
      groupId?: number;
      afterItemId?: number | null;
    }) => api<{ item: Item }>('PATCH', `/items/${input.itemId}`, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['items', boardId] });
      const prev = qc.getQueryData<Item[]>(['items', boardId]);
      if (input.name !== undefined) {
        qc.setQueryData<Item[]>(['items', boardId], (items) =>
          items?.map((it) => (it.id === input.itemId ? { ...it, name: input.name! } : it)),
        );
      }
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(['items', boardId], ctx.prev);
      toast.show((err as Error).message, 'error');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['items', boardId] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'item' });
    },
  });
}

export function useMoveItem(boardId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { itemId: number; groupId: number; afterItemId: number | null }) =>
      api<{ item: Item }>('PATCH', `/items/${input.itemId}`, {
        groupId: input.groupId,
        afterItemId: input.afterItemId,
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['items', boardId] });
      const prev = qc.getQueryData<Item[]>(['items', boardId]);
      if (prev) {
        const moved = prev.find((i) => i.id === input.itemId);
        if (moved) {
          const others = prev.filter((i) => i.id !== input.itemId);
          const anchor = input.afterItemId
            ? others.findIndex((i) => i.id === input.afterItemId)
            : -1;
          const next = [...others];
          next.splice(anchor + 1, 0, { ...moved, groupId: input.groupId });
          qc.setQueryData(['items', boardId], next);
        }
      }
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(['items', boardId], ctx.prev);
      toast.show((err as Error).message, 'error');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['items', boardId] });
    },
  });
}

export function useCreateItem(boardId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: {
      groupId: number;
      name: string;
      parentId?: number;
      at?: 'top' | 'bottom';
      values?: Record<string, unknown>;
    }) => api<{ item: Item }>('POST', `/boards/${boardId}/items`, input),
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['items', boardId] });
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });
}

export function useArchiveItems(boardId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (itemIds: number[]) =>
      api<{ count: number }>('POST', '/items/bulk', { itemIds, action: 'archive' }),
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: (_data, itemIds) => {
      undoStack.push({
        label: 'Item archived',
        undo: async () => {
          for (const id of itemIds) {
            await api('POST', `/items/${id}/restore`);
          }
          await qc.invalidateQueries({ queryKey: ['items', boardId] });
        },
        redo: async () => {
          await api('POST', '/items/bulk', { itemIds, action: 'archive' });
          await qc.invalidateQueries({ queryKey: ['items', boardId] });
        },
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['items', boardId] });
    },
  });
}

export function useBulkMove(boardId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { itemIds: number[]; groupId: number }) =>
      api<{ count: number }>('POST', '/items/bulk', {
        itemIds: input.itemIds,
        action: 'move',
        groupId: input.groupId,
      }),
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['items', boardId] });
    },
  });
}

function useBoardInvalidator(boardId: number) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['board', boardId] });
    qc.invalidateQueries({ queryKey: ['items', boardId] });
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'item' });
  };
}

export function useCreateColumn(boardId: number) {
  const qc = useQueryClient();
  const invalidate = useBoardInvalidator(boardId);
  const toast = useToast();
  return useMutation({
    mutationFn: (input: {
      title: string;
      type: string;
      settings?: Record<string, unknown>;
      afterColumnId?: number | null;
    }) => api<{ column: Column }>('POST', `/boards/${boardId}/columns`, input),
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: (data, input) => {
      undoStack.push({
        label: 'Column created',
        undo: async () => {
          const items = await api<{ items: Item[] }>('GET', `/boards/${boardId}/items`);
          if (items.items.some((item) => item.values[String(data.column.id)] !== undefined)) return;
          await api('DELETE', `/columns/${data.column.id}`);
          await invalidate();
        },
        redo: async () => {
          await api('POST', `/boards/${boardId}/columns`, input);
          await invalidate();
        },
      });
      void invalidate();
    },
  });
}

export function useUpdateColumn(boardId: number) {
  const qc = useQueryClient();
  const invalidate = useBoardInvalidator(boardId);
  const toast = useToast();
  return useMutation({
    mutationFn: (input: {
      columnId: number;
      title?: string;
      settings?: Record<string, unknown>;
      width?: number;
      afterColumnId?: number | null;
    }) => {
      const { columnId, ...patch } = input;
      return api<{ column: Column }>('PATCH', `/columns/${columnId}`, patch);
    },
    onMutate: async (input) => {
      const board = qc.getQueryData<BoardFull>(['board', boardId]);
      const previous = board?.columns.find((column) => column.id === input.columnId);
      return { previous };
    },
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: (data, input, ctx) => {
      if (ctx?.previous) {
        undoStack.push({
          label: 'Column changed',
          undo: async () => {
            await api('PATCH', `/columns/${input.columnId}`, {
              title: ctx.previous!.title,
              settings: ctx.previous!.settings,
              width: ctx.previous!.width,
            });
            await invalidate();
          },
          redo: async () => {
            await api('PATCH', `/columns/${input.columnId}`, {
              title: data.column.title,
              settings: data.column.settings,
              width: data.column.width,
            });
            await invalidate();
          },
        });
      }
      void invalidate();
    },
  });
}

export function useDeleteColumn(boardId: number) {
  const qc = useQueryClient();
  const invalidate = useBoardInvalidator(boardId);
  const toast = useToast();
  return useMutation({
    mutationFn: (columnId: number) => api('DELETE', `/columns/${columnId}`),
    onMutate: async (columnId) => {
      const board = qc.getQueryData<BoardFull>(['board', boardId]);
      return { previous: board?.columns.find((column) => column.id === columnId) };
    },
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: (_data, _columnId, ctx) => {
      if (ctx?.previous) {
        const previous = ctx.previous;
        undoStack.push({
          label: 'Column deleted',
          undo: async () => {
            await api('POST', `/boards/${boardId}/columns`, {
              title: previous.title,
              type: previous.type,
              settings: previous.settings,
            });
            await invalidate();
          },
        });
      }
      void invalidate();
    },
  });
}

export function useCreateGroup(boardId: number) {
  const qc = useQueryClient();
  const invalidate = useBoardInvalidator(boardId);
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { title: string; color?: string; at?: 'top' | 'bottom' }) =>
      api<{ group: Group }>('POST', `/boards/${boardId}/groups`, input),
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: (data, input) => {
      undoStack.push({
        label: 'Group created',
        undo: async () => {
          const items = await api<{ items: Item[] }>('GET', `/boards/${boardId}/items`);
          if (items.items.some((item) => item.groupId === data.group.id)) return;
          await api('DELETE', `/groups/${data.group.id}`);
          await invalidate();
        },
        redo: async () => {
          await api('POST', `/boards/${boardId}/groups`, input);
          await invalidate();
        },
      });
      void invalidate();
    },
  });
}

export function useUpdateGroup(boardId: number) {
  const qc = useQueryClient();
  const invalidate = useBoardInvalidator(boardId);
  const toast = useToast();
  return useMutation({
    mutationFn: (input: {
      groupId: number;
      title?: string;
      color?: string;
      collapsed?: boolean;
      afterGroupId?: number | null;
    }) => {
      const { groupId, ...patch } = input;
      return api<{ group: Group }>('PATCH', `/groups/${groupId}`, patch);
    },
    onMutate: async (input) => {
      const board = qc.getQueryData<BoardFull>(['board', boardId]);
      return { previous: board?.groups.find((group) => group.id === input.groupId) };
    },
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: (data, input, ctx) => {
      if (ctx?.previous) {
        undoStack.push({
          label: 'Group renamed',
          undo: async () => {
            await api('PATCH', `/groups/${input.groupId}`, {
              title: ctx.previous!.title,
              color: ctx.previous!.color,
            });
            await invalidate();
          },
          redo: async () => {
            await api('PATCH', `/groups/${input.groupId}`, {
              title: data.group.title,
              color: data.group.color,
            });
            await invalidate();
          },
        });
      }
      void invalidate();
    },
  });
}

export function useDeleteGroup(boardId: number) {
  const invalidate = useBoardInvalidator(boardId);
  const toast = useToast();
  return useMutation({
    mutationFn: (groupId: number) => api('DELETE', `/groups/${groupId}`),
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: invalidate,
  });
}

export function useCreateView(boardId: number) {
  const invalidate = useBoardInvalidator(boardId);
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { name: string; type: ViewType; settings?: Record<string, unknown> }) =>
      api<{ view: View }>('POST', `/boards/${boardId}/views`, input),
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: invalidate,
  });
}

export function useUpdateView(boardId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { viewId: number; name?: string; settings?: Record<string, unknown> }) => {
      const { viewId, ...patch } = input;
      return api<{ view: View }>('PATCH', `/views/${viewId}`, patch);
    },
    onMutate: async (input) => {
      const board = qc.getQueryData<BoardFull>(['board', boardId]);
      return { previous: board?.views.find((view) => view.id === input.viewId) };
    },
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: (data, input, ctx) => {
      if (ctx?.previous && input.name !== undefined) {
        undoStack.push({
          label: 'View renamed',
          undo: async () => {
            await api('PATCH', `/views/${input.viewId}`, { name: ctx.previous!.name });
            await qc.invalidateQueries({ queryKey: ['board', boardId] });
          },
          redo: async () => {
            await api('PATCH', `/views/${input.viewId}`, { name: data.view.name });
            await qc.invalidateQueries({ queryKey: ['board', boardId] });
          },
        });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['board', boardId] }),
  });
}

export function useDeleteView(boardId: number) {
  const invalidate = useBoardInvalidator(boardId);
  const toast = useToast();
  return useMutation({
    mutationFn: (viewId: number) => api('DELETE', `/views/${viewId}`),
    onError: (err) => toast.show((err as Error).message, 'error'),
    onSuccess: invalidate,
  });
}
