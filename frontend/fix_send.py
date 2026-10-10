import re
import sys

with open('src/pages/Send.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

new_imports = '''
import {
  ArrowRight,
  CheckCircle2,
  Link2,
  RotateCcw,
  ShieldAlert,
  Upload,
  UserCheck,
  Users,
  XCircle,
  FolderOpen,
  UploadCloud,
  X,
  Trash2,
} from "lucide-react";
'''
content = re.sub(r"import \{\n\s+ArrowRight.*?from 'lucide-react';", new_imports.strip(), content, flags=re.DOTALL)

content = content.replace("StatusAnnouncer,\n} from '../components/ui';", "StatusAnnouncer,\n  FileTypeIcon,\n  IconButton,\n} from '../components/ui';\nimport { cn } from '../lib/cn';")

content = content.replace("const ROOM_STORAGE_KEY = 'droply:send:room';", "const ROOM_STORAGE_KEY = 'droply:send:room';\nconst MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;\nconst MAX_FILES = 200;")

send_component_start = '''
  // Read once: the picker on Home staged these before navigating here.
  const [files] = useState<File[]>(() => peekStagedFiles());
'''
send_component_new = '''
  const [files, setFiles] = useState<File[]>(() => peekStagedFiles());
'''
content = content.replace(send_component_start, send_component_new)

state_add = '''
  const [phase, setPhase] = useState<Phase>(hasFiles ? 'opening' : 'no-files');
'''
state_new = '''
  const [phase, setPhase] = useState<Phase>(hasFiles ? 'opening' : 'no-files');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputId = 'file-upload-input';
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((added: FileList | File[]) => {
    setFiles((prev) => {
      const all = [...prev, ...Array.from(added)];
      const deduped = new Map<string, File>();
      for (const f of all) {
        deduped.set(f.name + f.size + f.lastModified, f);
      }
      return Array.from(deduped.values()).slice(0, MAX_FILES);
    });
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      dragDepth.current = 0;
      if (event.dataTransfer.files?.length) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const removeAt = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);
'''
content = content.replace(state_add, state_new)

empty_state_old = '''
  if (!hasFiles) {
    return (
      <div className="mx-auto w-full max-w-xl py-10">
        <Panel>
          <PanelHeader
            title="Send files"
            description="Nothing is selected yet"
            icon={<Upload className="size-5" aria-hidden="true" />}
          />
          <EmptyState
            icon={<Upload className="size-7" aria-hidden="true" />}
            title="Pick the files first"
            description="Droply holds your selection in this tab only - it is never uploaded, so a page refresh clears it. Choose the files again to open a new room."
            action={
              <Button onClick={() => navigate('/')} size="lg">
                Choose files
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }
'''

empty_state_new = '''
  if (phase === 'no-files') {
    return (
      <div className="mx-auto w-full max-w-2xl py-8 sm:py-12 px-4">
        <h1 className="text-3xl font-extrabold text-ink mb-8">Send files</h1>
        <Panel className="p-4 sm:p-6 shadow-float bg-surface-overlay/80 backdrop-blur-xl border-white/5">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div
              onDrop={onDrop}
              onDragOver={(event) => event.preventDefault()}
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current += 1;
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
              }}
              className={cn(
                'flex flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-all duration-200',
                dragging
                  ? 'border-brand bg-brand-soft/50 scale-[1.02]'
                  : 'border-line/50 bg-surface-sunken hover:border-brand/50 hover:bg-surface-hover/30',
              )}
            >
              <span
                className={cn(
                  'grid size-14 place-items-center rounded-2xl transition-all duration-200 shadow-md',
                  dragging ? 'bg-brand text-white shadow-brand-glow scale-110' : 'bg-surface-raised text-brand',
                )}
              >
                <UploadCloud className="size-7" aria-hidden="true" />
              </span>

              <h2 className="mt-4 text-lg font-bold text-ink">
                {dragging ? 'Drop to add' : 'Drop files here'}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">or browse your device</p>

              <label
                htmlFor={inputId}
                className="mt-6 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white shadow-brand-glow transition-all hover:bg-brand-hover active:scale-95"
              >
                <FolderOpen className="size-4" aria-hidden="true" />
                Choose files
              </label>
              <input
                id={inputId}
                ref={inputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files?.length) addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </div>

            <div className="flex flex-col rounded-card border border-line bg-surface-sunken">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 bg-surface-raised/50 rounded-t-card">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {files.length === 0
                      ? 'Nothing selected'
                      : files.length + ' files'}
                  </p>
                  <p className="text-xs text-ink-muted tabular">{formatBytes(grandTotal)} total</p>
                </div>
                {files.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Clear
                  </Button>
                )}
              </div>

              <div className="min-h-[12rem] flex-1 overflow-y-auto p-2 sm:max-h-64">
                {files.length === 0 ? (
                  <p className="flex h-full min-h-[10rem] items-center justify-center px-6 text-center text-sm text-ink-subtle">
                    Files you choose appear here before anything is shared.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {files.map((file, index) => (
                      <li
                        key={file.name + file.size + index}
                        className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-3 py-2 shadow-sm"
                      >
                        <FileTypeIcon filename={file.name} mimeType={file.type} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-xs text-ink-muted tabular">{formatBytes(file.size)}</p>
                        </div>
                        <IconButton
                          label={"Remove"}
                          onClick={() => removeAt(index)}
                          className="size-8 rounded-lg hover:bg-danger-soft hover:text-danger"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-line p-3 bg-surface-raised/50 rounded-b-card">
                <Button size="lg" fullWidth disabled={files.length === 0} onClick={() => setPhase('opening')} className="rounded-full shadow-brand-glow bg-brand text-white hover:bg-brand-hover">
                  <Link2 className="size-4" aria-hidden="true" />
                  Create transfer room
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    );
  }
'''

# Use regex to find the empty state because the old one might have an em dash.
content = re.sub(r"\s+if \(\!hasFiles\) \{[\s\S]*?<\/Panel>\n\s+<\/div>\n\s+\);\n\s+\}", empty_state_new, content)

with open('src/pages/Send.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
