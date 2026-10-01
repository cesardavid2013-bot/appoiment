"use client";

import dynamic from "next/dynamic";

export const LazyLocationMap = dynamic(() => import("./location-map"), { ssr: false, loading: () => <div className="skeleton size-full" /> });
