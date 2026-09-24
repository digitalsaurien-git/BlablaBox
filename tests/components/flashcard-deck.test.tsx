import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlashcardDeck, type Flashcard } from "@/components/flashcard-deck";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const cards: Flashcard[] = [
  {
    front: "Qu'est-ce que le photon ?",
    back: "Un quantum de lumière",
    refs: [
      {
        passageId: "p1",
        quote: "Le photon est la particule élémentaire de la lumière.",
      },
    ],
  },
  {
    front: "E = mc² signifie quoi ?",
    back: "Équivalence masse-énergie",
    refs: [],
  },
  {
    front: "Vitesse de la lumière ?",
    back: "299 792 458 m/s",
    refs: [],
  },
];

describe("FlashcardDeck", () => {
  it("affiche la première carte par défaut", () => {
    render(<FlashcardDeck courseId="c1" cards={cards} />);
    expect(screen.getByText("Carte 1 sur 3")).toBeInTheDocument();
    expect(
      screen.getByText("Qu'est-ce que le photon ?"),
    ).toBeInTheDocument();
  });

  it("retourne la carte au clic", async () => {
    const user = userEvent.setup();
    render(<FlashcardDeck courseId="c1" cards={cards} />);

    await user.click(
      screen.getByRole("button", { name: /retourner la carte/i }),
    );
    expect(screen.getByText("Un quantum de lumière")).toBeInTheDocument();
    expect(screen.getByText("Réponse")).toBeInTheDocument();
  });

  it("passe à la carte suivante", async () => {
    const user = userEvent.setup();
    render(<FlashcardDeck courseId="c1" cards={cards} />);

    await user.click(screen.getByRole("button", { name: /suivant/i }));
    expect(screen.getByText("Carte 2 sur 3")).toBeInTheDocument();
    expect(
      screen.getByText("E = mc² signifie quoi ?"),
    ).toBeInTheDocument();
  });

  it("revient à la carte précédente", async () => {
    const user = userEvent.setup();
    render(<FlashcardDeck courseId="c1" cards={cards} />);

    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /précédent/i }));
    expect(screen.getByText("Carte 1 sur 3")).toBeInTheDocument();
  });

  it("désactive Précédent sur la première carte", () => {
    render(<FlashcardDeck courseId="c1" cards={cards} />);
    expect(
      screen.getByRole("button", { name: /précédent/i }),
    ).toBeDisabled();
  });

  it("désactive Suivant sur la dernière carte", async () => {
    const user = userEvent.setup();
    render(<FlashcardDeck courseId="c1" cards={cards} />);

    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /suivant/i }));
    expect(screen.getByText("Carte 3 sur 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /suivant/i })).toBeDisabled();
  });

  it("recommence depuis le début", async () => {
    const user = userEvent.setup();
    render(<FlashcardDeck courseId="c1" cards={cards} />);

    await user.click(screen.getByRole("button", { name: /suivant/i }));
    await user.click(screen.getByRole("button", { name: /recommencer/i }));
    expect(screen.getByText("Carte 1 sur 3")).toBeInTheDocument();
  });

  it("affiche les références du cours", async () => {
    const user = userEvent.setup();
    render(<FlashcardDeck courseId="c1" cards={cards} />);

    // Ouvrir le détails
    await user.click(screen.getByText("Voir dans mon cours"));
    expect(
      screen.getByText(
        "Le photon est la particule élémentaire de la lumière.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ouvrir le passage source/i }),
    ).toHaveAttribute("href", "/courses/c1/passage/p1");
  });

  it("retourne null si le tableau de cartes est vide", () => {
    const { container } = render(
      <FlashcardDeck courseId="c1" cards={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
