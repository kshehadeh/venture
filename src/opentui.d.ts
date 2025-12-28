import "@opentui/react";
import type {
    BoxOptions,
    TextOptions,
    InputRenderableOptions,
    ASCIIFontOptions,
    ScrollBoxOptions
} from "@opentui/core";
import type { ExtendedComponentProps } from "@opentui/react";

declare module 'react/jsx-runtime' {
    namespace JSX {
        interface IntrinsicElements {
            box: ExtendedComponentProps<any, BoxOptions>;
            text: ExtendedComponentProps<any, TextOptions>;
            input: ExtendedComponentProps<any, InputRenderableOptions> & { focused?: boolean; onInput?: any; onSubmit?: any; onChange?: any };
            "ascii-font": ExtendedComponentProps<any, ASCIIFontOptions>;
            scrollbox: ExtendedComponentProps<any, ScrollBoxOptions> & { scrollTo?: string };
        }
    }
}

declare global {
    namespace JSX {
        interface IntrinsicElements {
            box: any;
            text: any;
            input: any;
            "ascii-font": any;
            scrollbox: any;
        }
    }
}
