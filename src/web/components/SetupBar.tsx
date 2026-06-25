import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SaveIcon from 'lucide-react/dist/esm/icons/save';
import CopyPlusIcon from 'lucide-react/dist/esm/icons/copy-plus';
import PencilIcon from 'lucide-react/dist/esm/icons/pencil';
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2';
import Share2Icon from 'lucide-react/dist/esm/icons/share-2';
import type { SetupsState } from '../hooks/useSetups.js';
import {
  Button, Input, Label,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogTitle,
} from '../ui/index.js';

type DialogMode = { kind: 'saveAs' | 'rename'; value: string } | null;

export function SetupBar({ setups }: { setups: SetupsState }) {
  const { t } = useTranslation('ui');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [copied, setCopied] = useState(false);

  const openSaveAs = () => setDialog({ kind: 'saveAs', value: setups.activeName ?? '' });
  const openRename = () => { if (setups.activeId) setDialog({ kind: 'rename', value: setups.activeName ?? '' }); };

  const confirmDialog = () => {
    if (!dialog || !dialog.value.trim()) return;
    if (dialog.kind === 'saveAs') setups.saveAs(dialog.value);
    else if (setups.activeId) setups.rename(setups.activeId, dialog.value);
    setDialog(null);
  };

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(setups.shareUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const onDelete = () => {
    if (setups.activeId && window.confirm(t('setups.deleteConfirm', { name: setups.activeName ?? '' }))) {
      setups.remove(setups.activeId);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Label className="mb-0 mr-1 text-muted-foreground">{t('setups.label')}</Label>

      {setups.setups.length > 0 ? (
        <Select value={setups.activeId ?? ''} onValueChange={(id) => setups.load(id)}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t('setups.unsaved')} /></SelectTrigger>
          <SelectContent>
            {setups.setups.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}{setups.activeId === s.id && setups.isDirty ? ' •' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-muted-foreground">{t('setups.none')}</span>
      )}

      <Button
        variant="outline" size="sm"
        onClick={() => setups.save()}
        disabled={!setups.activeId || !setups.isDirty}
      >
        <SaveIcon className="mr-1 size-4" />{t('setups.save')}
      </Button>
      <Button variant="outline" size="sm" onClick={openSaveAs}>
        <CopyPlusIcon className="mr-1 size-4" />{t('setups.saveAs')}
      </Button>

      {setups.activeId && (
        <>
          <Button variant="ghost" size="sm" onClick={openRename} aria-label={t('setups.rename')}>
            <PencilIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} aria-label={t('setups.delete')}>
            <Trash2Icon className="size-4" />
          </Button>
        </>
      )}

      <Button variant="ghost" size="sm" onClick={onShare}>
        <Share2Icon className="mr-1 size-4" />{copied ? t('setups.copied') : t('setups.share')}
      </Button>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogTitle>{dialog?.kind === 'rename' ? t('setups.rename') : t('setups.saveAs')}</DialogTitle>
          <form
            onSubmit={(e) => { e.preventDefault(); confirmDialog(); }}
            className="mt-3 flex flex-col gap-3"
          >
            <Input
              autoFocus
              value={dialog?.value ?? ''}
              onChange={(e) => setDialog((d) => (d ? { ...d, value: e.target.value } : d))}
              placeholder={t('setups.namePlaceholder')}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDialog(null)}>
                {t('setups.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={!dialog?.value.trim()}>
                {t('setups.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
