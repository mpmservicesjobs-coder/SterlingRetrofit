import "server-only";
import path from "node:path";
import { readFileSync } from "node:fs";
import { Document, Page, Text, View, Image, StyleSheet, Font, Svg, Polyline, renderToBuffer } from "@react-pdf/renderer";
import {
  BUSINESS,
  DUTY_OF_CARE_LINE,
  HIERARCHY_STATEMENT,
  HOUSEHOLDER_NOTE,
  KEEP_LINE,
} from "@/config/offload";
import {
  CAPACITIES,
  CUSTOMER_TYPES,
  NoteData,
  containerText,
  fullDescription,
  handlingText,
  isHouseholder,
  labelOf,
  quantityText,
  sicDisplay,
} from "./note";
import { formatEwc } from "./ewc";
import { formatDateTime, formatDate } from "./time";

const ASSETS = path.join(process.cwd(), "assets");
const font = (f: string) => path.join(ASSETS, "fonts", f);

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({ family: "Archivo Black", src: font("archivo-black-latin-400-normal.woff") });
  Font.register({
    family: "Inter",
    fonts: [
      { src: font("inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: font("inter-latin-500-normal.woff"), fontWeight: 500 },
      { src: font("inter-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  fontsReady = true;
}

let logo: Buffer | null = null;
function logoData(): Buffer {
  if (!logo) logo = readFileSync(path.join(ASSETS, "offload-logo.jpg"));
  return logo;
}

const INK = "#111111";
const LIME = "#D4F000";
const GRAPHITE = "#4A4A4A";
const RULE = "#9A9A9A";

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 70, paddingHorizontal: 30, fontFamily: "Inter", fontSize: 9, color: INK, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  logo: { width: 58, height: 58, marginRight: 12 },
  title: { fontFamily: "Archivo Black", fontSize: 20, textTransform: "uppercase", letterSpacing: 0.5 },
  headRight: { marginLeft: "auto", alignItems: "flex-end" },
  noteNo: { fontFamily: "Archivo Black", fontSize: 13 },
  bar: { backgroundColor: LIME, borderLeftWidth: 4, borderLeftColor: INK, paddingVertical: 3, paddingHorizontal: 6, marginTop: 8, marginBottom: 4 },
  barText: { fontFamily: "Archivo Black", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, color: INK },
  row: { flexDirection: "row", marginBottom: 2.5 },
  label: { width: 118, color: GRAPHITE, fontSize: 8.5 },
  value: { flex: 1, fontSize: 9.5 },
  cols: { flexDirection: "row" },
  col: { flex: 1, paddingRight: 8 },
  sigBox: { borderWidth: 1, borderColor: INK, height: 58, width: 170, padding: 3, justifyContent: "center", alignItems: "center" },
  sigImg: { maxHeight: 50, maxWidth: 160, objectFit: "contain" },
  sigLabel: { fontSize: 7.5, color: GRAPHITE, marginBottom: 2 },
  table: { borderTopWidth: 1, borderColor: INK },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK, paddingVertical: 3 },
  thText: { fontSize: 7.5, fontWeight: 700, color: GRAPHITE, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: RULE, paddingVertical: 4 },
  c1: { width: "34%", paddingRight: 4 },
  c2: { width: "10%", paddingRight: 4 },
  c3: { width: "12%", paddingRight: 4 },
  c4: { width: "17%", paddingRight: 4 },
  c5: { width: "27%" },
  tick: { width: 14, height: 14, borderWidth: 1.2, borderColor: INK, marginRight: 8, justifyContent: "center", alignItems: "center" },
  small: { fontSize: 7.5, color: GRAPHITE },
  footer: { position: "absolute", bottom: 22, left: 30, right: 30, borderTopWidth: 1, borderColor: INK, paddingTop: 5 },
  footStrong: { fontSize: 8.5, fontWeight: 700 },
  mono: { fontSize: 7, color: GRAPHITE, marginTop: 2 },
});

export type Signature = { png: Buffer; name: string; at: string };
export type Destination = { name: string; address: string; permit_no: string; last_checked: string | null } | null;

export type PdfInput = {
  noteNo: string;
  data: NoteData;
  vehicle: string;
  carrierRegNo: string;
  destination: Destination;
  customerSig: Signature;
  operativeSig: Signature;
  generatedAt: string;
  shortHash: string;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || " "}</Text>
    </View>
  );
}

function Bar({ n, title }: { n: number; title: string }) {
  return (
    <View style={s.bar} wrap={false} minPresenceAhead={40}>
      <Text style={s.barText}>
        {n}. {title}
      </Text>
    </View>
  );
}

function SigBox({ label, sig }: { label: string; sig: Signature }) {
  return (
    <View wrap={false} style={{ marginTop: 4 }}>
      <Text style={s.sigLabel}>{label}</Text>
      <View style={s.sigBox}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image style={s.sigImg} src={{ data: sig.png, format: "png" }} />
      </View>
      <Text style={s.small}>
        {sig.name}, signed {formatDateTime(sig.at)}
      </Text>
    </View>
  );
}

function Footer({ noteNo, generatedAt, shortHash }: { noteNo: string; generatedAt: string; shortHash: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footStrong}>{KEEP_LINE}</Text>
      <Text style={{ fontSize: 8 }}>
        {BUSINESS.TRADING_NAME}. Phone {BUSINESS.PHONE}. Email {BUSINESS.EMAIL}. {DUTY_OF_CARE_LINE}
      </Text>
      <Text
        style={s.mono}
        render={({ pageNumber, totalPages }) =>
          `${noteNo} | generated ${generatedAt} | hash ${shortHash} | page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

function Header({ title, noteNo, when }: { title: string; noteNo: string; when: string }) {
  return (
    <View style={s.header}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image style={s.logo} src={{ data: logoData(), format: "jpg" }} />
      <Text style={s.title}>{title}</Text>
      <View style={s.headRight}>
        <Text style={s.noteNo}>{noteNo}</Text>
        <Text style={{ fontSize: 9 }}>{when}</Text>
      </View>
    </View>
  );
}

function transfereeAddress(): string {
  return [...BUSINESS.ADDRESS_LINES, BUSINESS.POSTCODE].join(", ");
}

function NotePdf(p: PdfInput) {
  const d = p.data;
  const when = formatDateTime(d.transferAt);
  return (
    <Document title={`Waste transfer note ${p.noteNo}`} author={BUSINESS.TRADING_NAME} creator={BUSINESS.TRADING_NAME} producer={BUSINESS.TRADING_NAME}>
      <Page size="A4" style={s.page}>
        <Header title="Waste transfer note" noteNo={p.noteNo} when={when} />
        {d.supersedesNo ? (
          <Text style={{ fontSize: 9, fontWeight: 700, marginBottom: 2 }}>
            This note replaces note {d.supersedesNo}, which is superseded.
          </Text>
        ) : null}

        <Bar n={1} title="Transferor: who handed the waste over" />
        <View style={s.cols}>
          <View style={s.col}>
            <Row label="Name" value={d.customerName} />
            <Row label="Company" value={d.companyName || "None"} />
            <Row label="Customer type" value={labelOf(CUSTOMER_TYPES, d.customerType)} />
            <Row label="Address" value={d.address} />
            <Row label="Postcode" value={d.postcode} />
            <Row label="Capacity" value={labelOf(CAPACITIES, d.capacity)} />
            <Row label="SIC code" value={sicDisplay(d)} />
          </View>
          <SigBox label="Transferor signature" sig={p.customerSig} />
        </View>
        {isHouseholder(d) ? <Text style={s.small}>{HOUSEHOLDER_NOTE}</Text> : null}

        <Bar n={2} title="Transferee: who received the waste" />
        <View style={s.cols}>
          <View style={s.col}>
            <Row label="Name" value={BUSINESS.TRADING_NAME} />
            <Row label="Address" value={transfereeAddress()} />
            <Row label="Capacity" value={BUSINESS.CAPACITY} />
            <Row label="Registration number" value={p.carrierRegNo} />
            <Row label="Vehicle" value={p.vehicle} />
          </View>
          <SigBox label="Transferee signature" sig={p.operativeSig} />
        </View>

        <Bar n={3} title="The waste" />
        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={[s.thText, s.c1]}>Description</Text>
            <Text style={[s.thText, s.c2]}>EWC code</Text>
            <Text style={[s.thText, s.c3]}>Quantity</Text>
            <Text style={[s.thText, s.c4]}>Loose or container</Text>
            <Text style={[s.thText, s.c5]}>Handling notes</Text>
          </View>
          {d.lines.map((l) => (
            <View key={l.id} style={s.tr} wrap={false}>
              <Text style={s.c1}>{fullDescription(l)}</Text>
              <Text style={[s.c2, { fontWeight: 700 }]}>{formatEwc(l.ewc)}</Text>
              <Text style={s.c3}>{quantityText(l)}</Text>
              <Text style={s.c4}>{containerText(l)}</Text>
              <Text style={s.c5}>{handlingText(l)}</Text>
            </View>
          ))}
        </View>
        <Text style={[s.small, { marginTop: 2 }]}>None of this waste is hazardous. The transferor confirmed this at the time of transfer.</Text>

        <Bar n={4} title="Waste hierarchy statement" />
        <View style={{ flexDirection: "row", alignItems: "center" }} wrap={false}>
          <View style={s.tick}>
            {d.hierarchyConfirmed ? (
              <Svg width={10} height={10} viewBox="0 0 10 10">
                <Polyline points="1,5 4,8 9,1" stroke={INK} strokeWidth={1.8} fill="none" />
              </Svg>
            ) : null}
          </View>
          <Text style={{ flex: 1, fontSize: 9.5 }}>
            {HIERARCHY_STATEMENT} Ticked by the transferor: {d.hierarchyConfirmed ? "Yes" : "No"}.
          </Text>
        </View>

        <Bar n={5} title="Place and time of transfer" />
        <Row label="Place" value={`${d.address}, ${d.postcode}`} />
        <Row label="Date and time" value={when} />

        <Bar n={6} title="Destination" />
        {p.destination ? (
          <>
            <Row label="Site" value={p.destination.name} />
            <Row label="Address" value={p.destination.address} />
            <Row label="Permit or exemption" value={p.destination.permit_no} />
            <Row
              label="Checked on EA register"
              value={p.destination.last_checked ? formatDate(p.destination.last_checked) : "Not recorded"}
            />
          </>
        ) : (
          <Row label="Site" value="To be confirmed. Offload records the destination once the load is tipped." />
        )}

        <Footer noteNo={p.noteNo} generatedAt={p.generatedAt} shortHash={p.shortHash} />
      </Page>
    </Document>
  );
}

export async function renderNotePdf(p: PdfInput): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<NotePdf {...p} />);
}

export type DestinationPdfInput = {
  noteNo: string;
  originalHash: string;
  destination: NonNullable<Destination>;
  addedAt: string;
  generatedAt: string;
  shortHash: string;
};

/** A separate record of the destination, added after the note was signed. The signed note is never changed. */
function DestinationPdf(p: DestinationPdfInput) {
  return (
    <Document title={`Destination record ${p.noteNo}`} author={BUSINESS.TRADING_NAME}>
      <Page size="A4" style={s.page}>
        <Header title="Destination record" noteNo={p.noteNo} when={formatDateTime(p.addedAt)} />
        <Text style={{ fontSize: 9.5, marginBottom: 4 }}>
          This record adds the destination to waste transfer note {p.noteNo}. The signed note itself is unchanged
          (hash {p.originalHash.slice(0, 12)}).
        </Text>
        <Bar n={6} title="Destination" />
        <Row label="Site" value={p.destination.name} />
        <Row label="Address" value={p.destination.address} />
        <Row label="Permit or exemption" value={p.destination.permit_no} />
        <Row
          label="Checked on EA register"
          value={p.destination.last_checked ? formatDate(p.destination.last_checked) : "Not recorded"}
        />
        <Row label="Recorded" value={formatDateTime(p.addedAt)} />
        <Footer noteNo={p.noteNo} generatedAt={p.generatedAt} shortHash={p.shortHash} />
      </Page>
    </Document>
  );
}

export async function renderDestinationPdf(p: DestinationPdfInput): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<DestinationPdf {...p} />);
}
