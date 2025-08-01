import { CODE_BLOCK_BG_COLOR } from "@/components/common/CodeBlock"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { StateServiceClient } from "@/services/grpc-client"
import { ApiConfiguration, openRouterDefaultModelId } from "@shared/api"
import { StringRequest } from "@shared/proto/common"
import { VSCodeLink, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import Fuse from "fuse.js"
import React, { KeyboardEvent, memo, useEffect, useMemo, useRef, useState } from "react"
import { useRemark } from "react-remark"
import { useMount } from "react-use"
import styled from "styled-components"
import { highlight } from "../history/HistoryView"
import { ModelInfoView } from "./common/ModelInfoView"
import { normalizeApiConfiguration } from "./utils/providerUtils"
import FeaturedModelCard from "./FeaturedModelCard"
import ThinkingBudgetSlider from "./ThinkingBudgetSlider"
import { useApiConfigurationHandlers } from "./utils/useApiConfigurationHandlers"

// Star icon for favorites
const StarIcon = ({ isFavorite, onClick }: { isFavorite: boolean; onClick: (e: React.MouseEvent) => void }) => {
	return (
		<div
			onClick={onClick}
			style={{
				cursor: "pointer",
				color: isFavorite ? "var(--vscode-terminal-ansiBlue)" : "var(--vscode-descriptionForeground)",
				marginLeft: "8px",
				fontSize: "16px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				userSelect: "none",
				WebkitUserSelect: "none",
			}}>
			{isFavorite ? "★" : "☆"}
		</div>
	)
}

export interface OpenRouterModelPickerProps {
	isPopup?: boolean
}

// Featured models for Cline provider
const featuredModels = [
	{
		id: "anthropic/claude-sonnet-4",
		description: "Recommended for agentic coding in Cline",
		label: "Best",
	},
	{
		id: "moonshotai/kimi-k2",
		description: "Latest open source model, trained for agentic tool calling.",
		label: "Trending",
	},
	{
		id: "x-ai/grok-4",
		description: "Latest flagship model from xAI",
		label: "Fast & Cheap",
	},
]

const OpenRouterModelPicker: React.FC<OpenRouterModelPickerProps> = ({ isPopup }) => {
	const { handleFieldsChange } = useApiConfigurationHandlers()
	const { apiConfiguration, openRouterModels, refreshOpenRouterModels } = useExtensionState()
	const [searchTerm, setSearchTerm] = useState(apiConfiguration?.openRouterModelId || openRouterDefaultModelId)
	const [isSearchInputDirty, setIsSearchInputDirty] = useState(false)
	const [isDropdownVisible, setIsDropdownVisible] = useState(false)
	const [selectedIndex, setSelectedIndex] = useState(-1)
	const dropdownRef = useRef<HTMLDivElement>(null)
	const itemRefs = useRef<(HTMLDivElement | null)[]>([])
	const dropdownListRef = useRef<HTMLDivElement>(null)

	const handleModelChange = (newModelId: string) => {
		// could be setting invalid model id/undefined info but validation will catch it

		setSearchTerm(newModelId)

		handleFieldsChange({
			openRouterModelId: newModelId,
			openRouterModelInfo: openRouterModels[newModelId],
		})
	}

	const { selectedModelId, selectedModelInfo } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration)
	}, [apiConfiguration])

	useMount(refreshOpenRouterModels)

	// Sync external changes only when user isn't actively typing
	useEffect(() => {
		if (!isSearchInputDirty) {
			const currentModelId = apiConfiguration?.openRouterModelId || openRouterDefaultModelId
			setSearchTerm(currentModelId)
		}
	}, [apiConfiguration?.openRouterModelId, isSearchInputDirty])

	// Reset dirty flag after user stops typing (1 second timeout)
	useEffect(() => {
		if (!isSearchInputDirty) return
		const timeout = setTimeout(() => {
			setIsSearchInputDirty(false)
		}, 1000)
		return () => clearTimeout(timeout)
	}, [searchTerm, isSearchInputDirty])

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsDropdownVisible(false)
			}
		}

		document.addEventListener("mousedown", handleClickOutside)
		return () => {
			document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [])

	const modelIds = useMemo(() => {
		const unfilteredModelIds = Object.keys(openRouterModels).sort((a, b) => a.localeCompare(b))

		return apiConfiguration?.apiProvider === "cline"
			? unfilteredModelIds.filter((id) => !id.includes(":free"))
			: unfilteredModelIds
	}, [openRouterModels, apiConfiguration?.apiProvider])

	const searchableItems = useMemo(() => {
		return modelIds.map((id) => ({
			id,
			html: id,
		}))
	}, [modelIds])

	const fuse = useMemo(() => {
		return new Fuse(searchableItems, {
			keys: ["html"], // highlight function will update this
			threshold: 0.6,
			shouldSort: true,
			isCaseSensitive: false,
			ignoreLocation: false,
			includeMatches: true,
			minMatchCharLength: 1,
		})
	}, [searchableItems])

	const modelSearchResults = useMemo(() => {
		const favoritedModelIds = apiConfiguration?.favoritedModelIds || []

		// IMPORTANT: highlightjs has a bug where if you use sort/localCompare - "// results.sort((a, b) => a.id.localeCompare(b.id)) ...sorting like this causes ids in objects to be reordered and mismatched"

		// First, get all favorited models
		const favoritedModels = searchableItems.filter((item) => favoritedModelIds.includes(item.id))

		// Then get search results for non-favorited models
		const searchResults = searchTerm
			? highlight(fuse.search(searchTerm), "model-item-highlight").filter((item) => !favoritedModelIds.includes(item.id))
			: searchableItems.filter((item) => !favoritedModelIds.includes(item.id))

		// Combine favorited models with search results
		return [...favoritedModels, ...searchResults]
	}, [searchableItems, searchTerm, fuse, apiConfiguration?.favoritedModelIds])

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!isDropdownVisible) return

		switch (event.key) {
			case "ArrowDown":
				event.preventDefault()
				setSelectedIndex((prev) => (prev < modelSearchResults.length - 1 ? prev + 1 : prev))
				break
			case "ArrowUp":
				event.preventDefault()
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
				break
			case "Enter":
				event.preventDefault()
				if (selectedIndex >= 0 && selectedIndex < modelSearchResults.length) {
					handleModelChange(modelSearchResults[selectedIndex].id)
					setIsDropdownVisible(false)
				}
				break
			case "Escape":
				setIsDropdownVisible(false)
				setSelectedIndex(-1)
				break
		}
	}

	const hasInfo = useMemo(() => {
		try {
			return modelIds.some((id) => id.toLowerCase() === searchTerm.toLowerCase())
		} catch {
			return false
		}
	}, [modelIds, searchTerm])

	useEffect(() => {
		setSelectedIndex(-1)
		if (dropdownListRef.current) {
			dropdownListRef.current.scrollTop = 0
		}
	}, [searchTerm])

	useEffect(() => {
		if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
			itemRefs.current[selectedIndex]?.scrollIntoView({
				block: "nearest",
				behavior: "smooth",
			})
		}
	}, [selectedIndex])

	const showBudgetSlider = useMemo(() => {
		return (
			selectedModelId?.toLowerCase().includes("claude-sonnet-4") ||
			selectedModelId?.toLowerCase().includes("claude-opus-4") ||
			selectedModelId?.toLowerCase().includes("claude-3-7-sonnet") ||
			selectedModelId?.toLowerCase().includes("claude-3.7-sonnet") ||
			selectedModelId?.toLowerCase().includes("claude-3.7-sonnet:thinking")
		)
	}, [selectedModelId])

	return (
		<div style={{ width: "100%" }}>
			<style>
				{`
				.model-item-highlight {
					background-color: var(--vscode-editor-findMatchHighlightBackground);
					color: inherit;
				}
				`}
			</style>
			<div style={{ display: "flex", flexDirection: "column" }}>
				<label htmlFor="model-search">
					<span style={{ fontWeight: 500 }}>Model</span>
				</label>

				{apiConfiguration?.apiProvider === "cline" && (
					<div style={{ marginBottom: "6px", marginTop: 4 }}>
						{featuredModels.map((model) => (
							<FeaturedModelCard
								key={model.id}
								modelId={model.id}
								description={model.description}
								label={model.label}
								isSelected={selectedModelId === model.id}
								onClick={() => {
									handleModelChange(model.id)
									setIsDropdownVisible(false)
								}}
							/>
						))}
					</div>
				)}

				<DropdownWrapper ref={dropdownRef}>
					<VSCodeTextField
						id="model-search"
						placeholder="Search and select a model..."
						value={searchTerm}
						onInput={(e) => {
							setIsSearchInputDirty(true)
							handleModelChange((e.target as HTMLInputElement)?.value?.toLowerCase())
							setIsDropdownVisible(true)
						}}
						onFocus={() => setIsDropdownVisible(true)}
						onKeyDown={handleKeyDown}
						style={{
							width: "100%",
							zIndex: OPENROUTER_MODEL_PICKER_Z_INDEX,
							position: "relative",
						}}>
						{searchTerm && (
							<div
								className="input-icon-button codicon codicon-close"
								aria-label="Clear search"
								onClick={() => {
									handleModelChange("")
									setIsDropdownVisible(true)
								}}
								slot="end"
								style={{
									display: "flex",
									justifyContent: "center",
									alignItems: "center",
									height: "100%",
								}}
							/>
						)}
					</VSCodeTextField>
					{isDropdownVisible && (
						<DropdownList ref={dropdownListRef}>
							{modelSearchResults.map((item, index) => {
								const isFavorite = (apiConfiguration?.favoritedModelIds || []).includes(item.id)
								return (
									<DropdownItem
										key={item.id}
										ref={(el) => (itemRefs.current[index] = el)}
										isSelected={index === selectedIndex}
										onMouseEnter={() => setSelectedIndex(index)}
										onClick={() => {
											handleModelChange(item.id)
											setIsDropdownVisible(false)
										}}>
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
											<span dangerouslySetInnerHTML={{ __html: item.html }} />
											<StarIcon
												isFavorite={isFavorite}
												onClick={(e) => {
													e.stopPropagation()
													StateServiceClient.toggleFavoriteModel(
														StringRequest.create({ value: item.id }),
													).catch((error) => console.error("Failed to toggle favorite model:", error))
												}}
											/>
										</div>
									</DropdownItem>
								)
							})}
						</DropdownList>
					)}
				</DropdownWrapper>
			</div>

			{hasInfo ? (
				<>
					{showBudgetSlider && <ThinkingBudgetSlider />}

					<ModelInfoView selectedModelId={selectedModelId} modelInfo={selectedModelInfo} isPopup={isPopup} />
				</>
			) : (
				<p
					style={{
						fontSize: "12px",
						marginTop: 0,
						color: "var(--vscode-descriptionForeground)",
					}}>
					<>
						The extension automatically fetches the latest list of models available on{" "}
						<VSCodeLink style={{ display: "inline", fontSize: "inherit" }} href="https://openrouter.ai/models">
							OpenRouter.
						</VSCodeLink>
						If you're unsure which model to choose, Cline works best with{" "}
						<VSCodeLink
							style={{ display: "inline", fontSize: "inherit" }}
							onClick={() => handleModelChange("anthropic/claude-sonnet-4")}>
							anthropic/claude-sonnet-4.
						</VSCodeLink>
						You can also try searching "free" for no-cost options currently available.
					</>
				</p>
			)}
		</div>
	)
}

export default OpenRouterModelPicker

// Dropdown

const DropdownWrapper = styled.div`
	position: relative;
	width: 100%;
`

export const OPENROUTER_MODEL_PICKER_Z_INDEX = 1_000

const DropdownList = styled.div`
	position: absolute;
	top: calc(100% - 3px);
	left: 0;
	width: calc(100% - 2px);
	max-height: 200px;
	overflow-y: auto;
	background-color: var(--vscode-dropdown-background);
	border: 1px solid var(--vscode-list-activeSelectionBackground);
	z-index: ${OPENROUTER_MODEL_PICKER_Z_INDEX - 1};
	border-bottom-left-radius: 3px;
	border-bottom-right-radius: 3px;
`

const DropdownItem = styled.div<{ isSelected: boolean }>`
	padding: 5px 10px;
	cursor: pointer;
	word-break: break-all;
	white-space: normal;

	background-color: ${({ isSelected }) => (isSelected ? "var(--vscode-list-activeSelectionBackground)" : "inherit")};

	&:hover {
		background-color: var(--vscode-list-activeSelectionBackground);
	}
`

// Markdown

const StyledMarkdown = styled.div`
	font-family:
		var(--vscode-font-family),
		system-ui,
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		Roboto,
		Oxygen,
		Ubuntu,
		Cantarell,
		"Open Sans",
		"Helvetica Neue",
		sans-serif;
	font-size: 12px;
	color: var(--vscode-descriptionForeground);

	p,
	li,
	ol,
	ul {
		line-height: 1.25;
		margin: 0;
	}

	ol,
	ul {
		padding-left: 1.5em;
		margin-left: 0;
	}

	p {
		white-space: pre-wrap;
	}

	a {
		text-decoration: none;
	}
	a {
		&:hover {
			text-decoration: underline;
		}
	}
`

export const ModelDescriptionMarkdown = memo(
	({
		markdown,
		key,
		isExpanded,
		setIsExpanded,
		isPopup,
	}: {
		markdown?: string
		key: string
		isExpanded: boolean
		setIsExpanded: (isExpanded: boolean) => void
		isPopup?: boolean
	}) => {
		const [reactContent, setMarkdown] = useRemark()
		// const [isExpanded, setIsExpanded] = useState(false)
		const [showSeeMore, setShowSeeMore] = useState(false)
		const textContainerRef = useRef<HTMLDivElement>(null)
		const textRef = useRef<HTMLDivElement>(null)

		useEffect(() => {
			setMarkdown(markdown || "")
		}, [markdown, setMarkdown])

		useEffect(() => {
			if (textRef.current && textContainerRef.current) {
				const { scrollHeight } = textRef.current
				const { clientHeight } = textContainerRef.current
				const isOverflowing = scrollHeight > clientHeight
				setShowSeeMore(isOverflowing)
				// if (!isOverflowing) {
				// 	setIsExpanded(false)
				// }
			}
		}, [reactContent, setIsExpanded])

		return (
			<StyledMarkdown key={key} style={{ display: "inline-block", marginBottom: 0 }}>
				<div
					ref={textContainerRef}
					style={{
						overflowY: isExpanded ? "auto" : "hidden",
						position: "relative",
						wordBreak: "break-word",
						overflowWrap: "anywhere",
					}}>
					<div
						ref={textRef}
						style={{
							display: "-webkit-box",
							WebkitLineClamp: isExpanded ? "unset" : 3,
							WebkitBoxOrient: "vertical",
							overflow: "hidden",
							// whiteSpace: "pre-wrap",
							// wordBreak: "break-word",
							// overflowWrap: "anywhere",
						}}>
						{reactContent}
					</div>
					{!isExpanded && showSeeMore && (
						<div
							style={{
								position: "absolute",
								right: 0,
								bottom: 0,
								display: "flex",
								alignItems: "center",
							}}>
							<div
								style={{
									width: 30,
									height: "1.2em",
									background: "linear-gradient(to right, transparent, var(--vscode-sideBar-background))",
								}}
							/>
							<VSCodeLink
								style={{
									// cursor: "pointer",
									// color: "var(--vscode-textLink-foreground)",
									fontSize: "inherit",
									paddingRight: 0,
									paddingLeft: 3,
									backgroundColor: isPopup ? CODE_BLOCK_BG_COLOR : "var(--vscode-sideBar-background)",
								}}
								onClick={() => setIsExpanded(true)}>
								See more
							</VSCodeLink>
						</div>
					)}
				</div>
				{/* {isExpanded && showSeeMore && (
				<div
					style={{
						cursor: "pointer",
						color: "var(--vscode-textLink-foreground)",
						marginLeft: "auto",
						textAlign: "right",
						paddingRight: 2,
					}}
					onClick={() => setIsExpanded(false)}>
					See less
				</div>
			)} */}
			</StyledMarkdown>
		)
	},
)
