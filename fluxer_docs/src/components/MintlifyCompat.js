import React from 'react';
import Link from '@docusaurus/Link';
import Admonition from '@theme/Admonition';
import useBaseUrl from '@docusaurus/useBaseUrl';

export function Card(props) {
	const {title, href = '#', children, horizontal = false} = props;
	const baseHref = useBaseUrl(href);
	const resolvedHref =
		href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') ? href : baseHref;

	return (
		<Link className={`fluxer-card${horizontal ? ' fluxer-card-horizontal' : ''}`} to={resolvedHref}>
			<div className="fluxer-card-title">{title}</div>
			<div className="fluxer-card-body">{children}</div>
		</Link>
	);
}

export function CardGroup(props) {
	const cols = typeof props.cols === 'number' && props.cols > 0 ? props.cols : 2;
	return (
		<div
			className="fluxer-card-group"
			style={{
				gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
			}}
		>
			{props.children}
		</div>
	);
}

export function Warning(props) {
	return <Admonition type="warning">{props.children}</Admonition>;
}

export function Note(props) {
	return <Admonition type="note">{props.children}</Admonition>;
}

export function Expandable(props) {
	return (
		<details className="fluxer-expandable">
			<summary>{props.title ?? 'More details'}</summary>
			<div className="fluxer-expandable-body">{props.children}</div>
		</details>
	);
}

export function Frame(props) {
	return (
		<figure className="fluxer-frame">
			<div className="fluxer-frame-body">{props.children}</div>
			{props.caption ? <figcaption>{props.caption}</figcaption> : null}
		</figure>
	);
}
