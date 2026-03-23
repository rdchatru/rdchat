/*
 * Copyright (C) 2026 Fluxer Contributors
 *
 * This file is part of Fluxer.
 *
 * Fluxer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Fluxer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Fluxer. If not, see <https://www.gnu.org/licenses/>.
 */

import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

export const FluxerSymbol = observer((props: React.SVGProps<SVGSVGElement>) => {
    const {t} = useLingui();

    const originalWidth = 25.404;
    const originalHeight = 23.654;

    // Center of the new viewport (e.g., 26x26)
    const centerX = originalWidth / 2;
    const centerY = originalHeight / 2;

    // Scale factor to shrink slightly (e.g., 85%)
    const scale = 0.85;

    // Calculate translations to keep it centered
    const translateX = centerX - centerX * scale;
    const translateY = centerY - centerY * scale;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${originalWidth} ${originalHeight}`} // Viewport stays the same size
            role="img"
            aria-label={t`Fluxer application symbol, scaled for a circle`}
            fill="currentColor"
            {...props}
        >
            <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`}>
                <path d="M 0.5006783,8.5524056 4.550347,0 8.6283354,8.4674479 c 0,0 -4.3045433,-5.7204832 -8.1276571,0.084959 z" />
                <path d="m 15.635307,8.5587775 4.049669,-8.5524059 4.077988,8.4674482 c 0,0 -4.304543,-5.7204835 -8.127657,0.084959 z" />
                <path d="m 0.5813497,10.859675 c 0,0 4.1984007,-3.4470907 8.0432518,0.08839 3.8448515,3.535478 -8.0432518,-0.08839 -8.0432518,-0.08839 z" />
                <path d="m 24.327625,10.992256 c 0,0 -4.198402,-3.4470913 -8.043253,0.08839 -3.844851,3.535478 8.043253,-0.08839 8.043253,-0.08839 z" />
                <path d="m 0.537156,15.809345 c 0,0 3.9332385,3.977412 8.043252,-0.176774 4.110014,-4.154186 4.06582,-4.109993 4.06582,-4.109993 v 2.121286 c 0,0 1.248304,-0.921129 -3.889046,3.668059 -3.7836822,3.379958 -8.087445,0.397741 -8.087445,0.397741 0,0 -1.41419813,-0.928062 -0.132581,-1.900319 z" />
                <path d="m 24.749629,15.80812 c 0,0 -3.933238,3.977412 -8.043252,-0.176774 -4.110013,-4.154186 -4.06582,-4.109993 -4.06582,-4.109993 v 2.121286 c 0,0 -1.248304,-0.921129 3.889046,3.668059 3.783682,3.379958 8.087445,0.397741 8.087445,0.397741 0,0 1.414199,-0.928062 0.132581,-1.900319 z" />
                <path d="m 25.020989,20.162856 c 0.861777,0.331451 -4e-6,1.060644 -4e-6,1.060644 0,0 -3.579845,1.834028 -5.833789,2.320158 -2.166977,0.467371 -6.304097,-0.614277 -4.640472,-2.032901 2.08746,-1.780041 3.270429,-1.325804 4.507887,0.309354 1.23746,1.635159 -0.309365,0.530323 -0.309365,0.530323 0,0 3.425121,0.375644 6.275743,-2.187578 z" />
            </g>
        </svg>
    );
});
