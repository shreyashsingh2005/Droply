import { Link } from 'react-router-dom';
import {
  CloudOff,
  Database,
  Eye,
  Globe,
  Lock,
  Radio,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Alert, Panel, PanelHeader } from '../components/ui';

/**
 * Privacy page.
 *
 * Written to be accurate rather than flattering. In particular it does *not*
 * claim end-to-end encryption: WebRTC gives DTLS-encrypted transport between
 * the two browsers, which is a real and meaningful protection, but Droply does
 * not add an independent application-layer key exchange, so "end-to-end
 * encrypted" would overstate what is implemented.
 */

const SECTIONS = [
  {
    id: 'files',
    Icon: CloudOff,
    title: 'Your files never reach a server',
    body: [
      'Droply has no file storage, no upload endpoint, and no server-side fallback that would accept your bytes if a direct connection fails. When a transfer cannot be established, it fails — it does not quietly route your files through somebody else’s disk.',
      'The files you pick stay in the sending browser tab until a peer connection carries them straight to the receiving browser tab.',
    ],
  },
  {
    id: 'transport',
    Icon: Lock,
    title: 'What encryption you actually get',
    body: [
      'File data travels over a WebRTC data channel. WebRTC mandates DTLS for data channels, so the bytes are encrypted in transit between the two browsers and cannot be read by the network in between.',
      'Droply does not layer its own key exchange on top of that. Calling it “end-to-end encrypted” would imply a guarantee Droply does not implement, so we describe it as what it is: an encrypted direct transport.',
      'Separately, every file is hashed with SHA-256 on the sending side and re-hashed on the receiving side. That detects corruption and truncation. It is an integrity check, not an authentication mechanism.',
    ],
  },
  {
    id: 'signalling',
    Icon: Radio,
    title: 'What the signalling service sees',
    body: [
      'Two browsers cannot find each other unaided, so a small Cloudflare Worker introduces them. It relays the connection-setup messages — session descriptions and network candidates — between the two peers in a room.',
      'That means the service necessarily handles: the room code, the two peers’ network addresses (contained in ICE candidates), and timing. It does not receive file names, file sizes, file contents, or any list of what you transferred — none of that is in a signalling message.',
      'Relayed messages are passed between the two sockets in a room and are not stored. A room is held in memory for the life of its connections and discarded after 30 minutes of inactivity.',
    ],
  },
  {
    id: 'relay',
    Icon: Globe,
    title: 'When a relay is involved',
    body: [
      'Most networks allow two devices to connect directly, sometimes with help from a STUN server that only reports back what your public address looks like.',
      'Some networks — most mobile carriers behind carrier-grade NAT, and many corporate or guest Wi-Fi networks — block direct peer-to-peer paths entirely. A connection there requires a TURN relay, which forwards the encrypted stream between the peers.',
      'A TURN relay forwards DTLS-encrypted data it cannot read, but it is still a third party in the path, and it sees connection metadata. If this deployment has no TURN server configured, transfers on those networks will simply fail rather than fall back to anything.',
    ],
  },
  {
    id: 'storage',
    Icon: Database,
    title: 'What is stored on your device',
    body: [
      'Transfer history: file names, types, sizes, direction, outcome and timestamps, kept in this browser’s IndexedDB. File contents are never written to it.',
      'Your theme preference, in localStorage.',
      'The current room code, in sessionStorage, so refreshing the Send screen does not pull a working room out from under the other device. It is cleared when the tab closes.',
      'Received files exist only as temporary objects in the receiving tab. Closing or reloading that tab discards them.',
    ],
  },
  {
    id: 'third-parties',
    Icon: Eye,
    title: 'No analytics, no trackers, no accounts',
    body: [
      'Droply has no analytics, no advertising, no third-party scripts, and no accounts. There is nothing to sign up for and no profile to build.',
      'Public STUN servers are contacted during connection setup; that is the only outbound request Droply makes besides the signalling connection itself and loading its own assets.',
    ],
  },
] as const;

export function Privacy() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 sm:py-10">
      <header className="mb-8">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-ink sm:text-3xl">
          <ShieldCheck className="size-7 text-brand" aria-hidden="true" />
          Privacy
        </h1>
        <p className="mt-3 max-w-2xl text-ink-muted">
          What Droply does with your data, described precisely. Where a guarantee is weaker than it
          might sound, this page says so.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {SECTIONS.map(({ id, Icon, title, body }) => (
          <Panel key={id} id={id} className="scroll-mt-24">
            <PanelHeader title={title} icon={<Icon className="size-5" aria-hidden="true" />} />
            <div className="flex flex-col gap-3 p-5 sm:p-7">
              {body.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-ink-muted">
                  {paragraph}
                </p>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <Alert tone="neutral" className="mt-6" title="Removing your data">
        <span className="flex flex-wrap items-center gap-1.5">
          <Trash2 className="size-3.5 shrink-0" aria-hidden="true" />
          Clear your transfer history from the
          <Link to="/history" className="font-semibold text-brand hover:underline">
            History page
          </Link>
          , or clear site data in your browser settings to remove everything Droply has stored.
        </span>
      </Alert>
    </div>
  );
}
