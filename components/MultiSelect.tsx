"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Combobox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon, XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";

export type Option = { id: string; label: string };

type MultiSelectProps = {
    value: Option[];
    onChange: (v: Option[]) => void;
    placeholder?: string;
    // If you want to fetch options from server as user types:
    loadOptions?: (query: string) => Promise<Option[]>;
    // Or pass a static list:
    options?: Option[];
    allowCreate?: boolean;       // allow creating new tags not in options
    nameForForm?: string;        // if provided, will emit hidden inputs for form posts
    disabled?: boolean;
};

export default function MultiSelect({
    value,
    onChange,
    placeholder = "Search…",
    loadOptions,
    options = [],
    allowCreate = false,
    nameForForm,
    disabled,
}: MultiSelectProps) {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [fetched, setFetched] = useState<Option[]>([]);

    // fetch on query
    useEffect(() => {
        let cancelled = false;
        if (!loadOptions) return;
        (async () => {
            setLoading(true);
            try {
                const res = await loadOptions(query);
                if (!cancelled) setFetched(res);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [query, loadOptions]);

    const all = loadOptions ? fetched : options;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return all;
        return all.filter(o => o.label.toLowerCase().includes(q));
    }, [all, query]);

    const inValue = (o: Option) => value.some(v => v.id === o.id);

    const createCandidate =
        allowCreate && query.trim().length > 0 && !all.some(o => o.label.toLowerCase() === query.trim().toLowerCase())
            ? { id: `__new__:${query.trim()}`, label: query.trim() }
            : null;

    function addOption(o: Option) {
        if (inValue(o)) return;
        onChange([...value, o]);
        setQuery("");
    }
    function removeOption(id: string) {
        onChange(value.filter(v => v.id !== id));
    }

    return (
        <div className="w-full">
            {/* hidden inputs for normal <form> POST */}
            {nameForForm && value.map((v, i) => (
                <input key={v.id} type="hidden" name={nameForForm} value={v.id} />
            ))}

            <Combobox value={value} onChange={(o: Option | Option[]) => {
                // headlessui will pass single option when multiple
                if (Array.isArray(o)) onChange(o);
                else addOption(o);
            }} multiple>
                <div className="relative">
                    {/* Input / button */}
                    <div className="relative w-full cursor-text rounded-md border border-[var(--border)] bg-[var(--glass)] pl-2 pr-10 py-1 focus-within:ring-2 focus-within:white">
                        {/* Selected tags */}
                        <div className="flex flex-wrap gap-1">
                            {value.map(v => (
                                <span key={v.id} className="inline-flex items-center gap-1 rounded bg-white text-blue-800 px-2 py-0.5 text-xs">
                                    {v.label}
                                    <button title="button" type="button" onClick={() => removeOption(v.id)} className="hover:text-blue-900">
                                        <XMarkIcon className="h-4 w-4" />
                                    </button>
                                </span>
                            ))}
                            <Combobox.Input
                                className="ml-1 flex-1 outline-none text-sm placeholder-gray-400"
                                onChange={(e) => setQuery(e.target.value)}
                                value={query}
                                placeholder={value.length ? "" : placeholder}
                                displayValue={() => ""}
                                disabled={disabled}
                            />
                        </div>

                        <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2" disabled={disabled}>
                            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                        </Combobox.Button>
                    </div>

                    <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                        afterLeave={() => setQuery(q => q)}
                    >
                        <Combobox.Options className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg focus:outline-none">
                            {loading && (
                                <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>
                            )}

                            {!loading && filtered.length === 0 && !createCandidate && (
                                <div className="px-3 py-2 text-sm text-gray-500">No results</div>
                            )}

                            {/* render options */}
                            {filtered.map((o) => (
                                <Combobox.Option
                                    key={o.id}
                                    value={o}
                                    className={({ active }) =>
                                        `flex items-center justify-between cursor-pointer px-3 py-2 text-sm ${active ? "bg-blue-900" : "bg-black"
                                        }`
                                    }
                                    onClick={() => addOption(o)}
                                >
                                    <span>{o.label}</span>
                                    {inValue(o) && <CheckIcon className="h-4 w-4 text-blue-900" />}
                                </Combobox.Option>
                            ))}

                            {/* optional create-new */}
                            {createCandidate && (
                                <Combobox.Option
                                    value={createCandidate}
                                    className="flex items-center gap-2 cursor-pointer px-3 py-2 text-sm bg-green-50"
                                    onClick={() => addOption(createCandidate)}
                                >
                                    <PlusIcon className="h-4 w-4 text-green-700" />
                                    Create “{createCandidate.label}”
                                </Combobox.Option>
                            )}
                        </Combobox.Options>
                    </Transition>
                </div>
            </Combobox>
        </div>
    );
}