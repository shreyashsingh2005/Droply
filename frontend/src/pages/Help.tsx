import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, HelpCircle, LifeBuoy, Smartphone, Wifi } from 'lucide-react';
import { Alert, Panel, PanelHeader } from '../components/ui';
import { cn } from '../lib/cn';

interface Faq {
  q: string;
  a: string[];
}

const CONNECTION: Faq[] = [
  {
    q: 'The receiver is stuck waiting for the sender',
    a: [
      'That state means the room exists and you are in it, but the other device is not currently connected to it. Check that the sending device still has its Droply tab open on the Send screen — closing the tab, or letting a phone sleep for a long time, drops it out of the room.',
      'Also check the code character for character. Droply room codes never contain the letters O, I, S or B, or the digits 0, 1, 5 and 8, precisely so they cannot be confused.',
    ],
  },
  {
    q: 'Both devices joined but the connection never completes',
    a: [
      'Droply gives negotiation 45 seconds and then reports a failure rather than spinning forever. The usual cause is a network that blocks direct peer-to-peer traffic: mobile data behind carrier-grade NAT, corporate Wi-Fi, guest networks, and some VPNs all do this.',
      'The reliable workaround is to put both devices on the same Wi-Fi network. If you run your own Droply deployment and need it to work across restrictive networks, configure a TURN relay on the signalling Worker — see the deployment notes in the repository.',
    ],
  },
  {
    q: 'The transfer stopped partway through',
    a: [
      'A dropped Wi-Fi connection or a phone switching between Wi-Fi and mobile data will interrupt the data channel. Droply tries one ICE restart and waits ten seconds before giving up.',
      'Nothing partial is ever saved on the receiving device: a file is only offered once every byte has arrived and its SHA-256 hash matches the original. Start the transfer again — any file that had already completed and been verified stays available to save.',
    ],
  },
  {
    q: 'It says the room was opened somewhere else',
    a: [
      'A room holds one sender and one receiver. Opening the same room in a second tab or window takes over that slot and closes the first connection. Close the extra tab and try again.',
    ],
  },
];

const FILES: Faq[] = [
  {
    q: 'A file downloaded but will not open',
    a: [
      'Droply verifies every file against the sender’s SHA-256 hash before offering it, so a file you can save is byte-identical to the original. If it still will not open, the likely cause is the file name losing its extension when your browser saved it — check the saved name and restore the extension.',
      'Droply also fills in the file type from the extension when the sending device reported nothing, which is what lets photos, archives and documents open in the right app.',
    ],
  },
  {
    q: 'Why is nothing downloading automatically?',
    a: [
      'By design. An automatic download is blocked as a popup on most browsers after the first file, and on iPhone it replaces the page instead of saving. Droply shows a Save button for each verified file so the save happens on your tap and actually works.',
    ],
  },
  {
    q: 'Can I re-download something from History?',
    a: [
      'No, and History says so rather than implying otherwise. Droply records only metadata — names, sizes, times — and never stores file contents, so there is nothing to re-download. Ask the sender to share the file again.',
    ],
  },
  {
    q: 'What are the limits?',
    a: [
      'Up to 100 files per transfer and 2 GB per file. Zero-byte files, Unicode and emoji file names, and duplicate names all transfer correctly.',
      'Very large transfers are limited mostly by the receiving device: the received file is held in that tab until you save it.',
    ],
  },
];

const DEVICES: Faq[] = [
  {
    q: 'iPhone and iPad',
    a: [
      'Saving goes to the Files app rather than prompting for a location. For photos you want in your camera roll, use the Share button and choose Save Image.',
      'Keep the Droply tab in the foreground during a transfer. iOS suspends background tabs aggressively, which will drop the connection.',
    ],
  },
  {
    q: 'Android',
    a: [
      'Chrome saves to your Downloads folder. Transfers over mobile data often cannot establish a direct connection — use Wi-Fi where possible.',
    ],
  },
  {
    q: 'Which browsers work?',
    a: [
      'Droply needs WebRTC data channels, which means a current version of Chrome, Edge, Safari or Firefox on desktop, and Safari or Chrome on mobile. Browsers without WebRTC data channel support cannot transfer files at all, and Droply will report that rather than appearing to work.',
    ],
  },
];

function FaqList({ items }: { items: Faq[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ul className="divide-y divide-line">
      {items.map((item, index) => {
        const expanded = open === index;
        return (
          <li key={item.q}>
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-hover/60"
              >
                <span className="text-sm font-semibold text-ink">{item.q}</span>
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-ink-subtle transition-transform duration-200',
                    expanded && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>
            </h3>
            {expanded && (
              <div className="flex flex-col gap-2.5 px-5 pb-5">
                {item.a.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-ink-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Help() {
  return (
    <div className="mx-auto w-full max-w-3xl py-8 sm:py-10">
      <header className="mb-8">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-ink sm:text-3xl">
          <LifeBuoy className="size-7 text-brand" aria-hidden="true" />
          Help &amp; troubleshooting
        </h1>
        <p className="mt-3 max-w-2xl text-ink-muted">
          Most problems come down to one of the two networks blocking direct connections. Start
          there.
        </p>
      </header>

      <Alert tone="info" className="mb-5" title="The single most useful fix">
        Put both devices on the same Wi-Fi network. Mobile data and corporate or guest Wi-Fi
        frequently prevent a direct peer-to-peer path, which no amount of retrying will solve
        without a TURN relay.
      </Alert>

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHeader title="Connection problems" icon={<Wifi className="size-5" aria-hidden="true" />} />
          <FaqList items={CONNECTION} />
        </Panel>

        <Panel>
          <PanelHeader title="Files and downloads" icon={<HelpCircle className="size-5" aria-hidden="true" />} />
          <FaqList items={FILES} />
        </Panel>

        <Panel>
          <PanelHeader title="Devices and browsers" icon={<Smartphone className="size-5" aria-hidden="true" />} />
          <FaqList items={DEVICES} />
        </Panel>
      </div>

      <Alert tone="neutral" className="mt-6" title="Diagnostics">
        Add <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs">?debug=1</code>{' '}
        to the address to turn on verbose connection logging in the browser console for this tab.
        It is useful when reporting a connection problem.{' '}
        <Link to="/privacy" className="font-semibold text-brand hover:underline">
          Privacy details
        </Link>
        .
      </Alert>
    </div>
  );
}
