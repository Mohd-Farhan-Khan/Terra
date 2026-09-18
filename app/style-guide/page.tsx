"use client";

import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  ProgressBar,
  SegmentedControl,
  Select,
  SlideOverPanel,
  Tabs,
} from "@/components/ui";

const tabItems = [
  { label: "Overview", value: "overview" },
  { label: "Activity", value: "activity" },
  { label: "Notes", value: "notes" },
];

export default function StyleGuidePage() {
  const [tab, setTab] = useState("overview");
  const [segment, setSegment] = useState("month");
  const [modalOpen, setModalOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <main className="min-h-screen bg-terra-cream px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-terra-tan pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-terra-clay">Terra / foundation</p>
          <h1 className="mt-3 font-terra-heading text-5xl leading-[0.94] text-terra-ink sm:text-6xl">
            A quiet system for daily money.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-terra-gray">
            Warm paper surfaces, clear hierarchy, and calm controls built for financial focus.
          </p>
        </header>

        <div className="grid gap-8 py-10 lg:grid-cols-2">
          <Card eyebrow="Actions" title="Buttons" description="A restrained hierarchy for decisions and quiet utility.">
            <div className="flex flex-wrap gap-3">
              <Button>Save entry</Button>
              <Button variant="secondary">Review later</Button>
              <Button variant="ghost">Cancel</Button>
              <Button size="sm">Compact</Button>
            </div>
          </Card>

          <Card
            eyebrow="Status"
            title="Badges & progress"
            description="Reserve color for information that benefits from emphasis."
          >
            <div className="flex flex-wrap gap-2">
              <Badge>Planned</Badge>
              <Badge tone="sage">On track</Badge>
              <Badge tone="clay">Due soon</Badge>
              <Badge tone="brick">Over budget</Badge>
            </div>
            <div className="mt-6 grid gap-4">
              <ProgressBar label="House fund" tone="sage" value={64} />
              <ProgressBar label="Monthly essentials" value={78} />
              <ProgressBar label="Dining out" tone="brick" value={96} />
            </div>
          </Card>

          <Card
            eyebrow="Entry"
            title="Fields"
            description="Inputs carry their own breathing room and gentle focus state."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Amount" placeholder="₹0.00" />
              <Select
                label="Account"
                options={[
                  { label: "Main checking", value: "checking" },
                  { label: "Cash wallet", value: "cash" },
                ]}
              />
              <Input error="Add a note before saving." label="Note" placeholder="What was this for?" />
              <Select
                hint="Categories are organised by type."
                label="Category"
                options={[
                  { label: "Groceries", value: "groceries" },
                  { label: "Rent", value: "rent" },
                ]}
              />
            </div>
          </Card>

          <Card
            eyebrow="Navigation"
            title="Tabs & segments"
            description="Two related patterns, each with one clear selected state."
          >
            <Tabs items={tabItems} onValueChange={setTab} value={tab} />
            <p className="mt-4 text-sm text-terra-gray">Showing {tab}.</p>
            <div className="mt-6">
              <SegmentedControl
                items={[
                  { label: "Month", value: "month" },
                  { label: "Quarter", value: "quarter" },
                  { label: "Year", value: "year" },
                ]}
                onValueChange={setSegment}
                value={segment}
              />
            </div>
          </Card>

          <Card
            className="lg:col-span-2"
            eyebrow="Layers"
            title="Modal & slide-over panel"
            description="Focused work appears above the page without visual noise."
          >
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setModalOpen(true)}>Open modal</Button>
              <Button onClick={() => setPanelOpen(true)} variant="secondary">
                Open panel
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        description="A clear, contained decision space."
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title="Pause before saving"
      >
        <p className="text-sm leading-6 text-terra-gray">This is where confirmation copy or a small form belongs.</p>
        <div className="mt-7 flex justify-end gap-3">
          <Button onClick={() => setModalOpen(false)} variant="ghost">
            Cancel
          </Button>
          <Button onClick={() => setModalOpen(false)}>Continue</Button>
        </div>
      </Modal>

      <SlideOverPanel
        description="A spacious companion for focused forms and detail."
        onClose={() => setPanelOpen(false)}
        open={panelOpen}
        title="Add a transaction"
      >
        <div className="grid gap-5">
          <Input label="Amount" placeholder="₹0.00" />
          <Select label="Account" options={[{ label: "Main checking", value: "checking" }]} />
          <Input label="Note" placeholder="Optional note" />
          <Button>Save draft</Button>
        </div>
      </SlideOverPanel>
    </main>
  );
}
